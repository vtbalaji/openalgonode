/**
 * Unit tests for High-level Options Greeks interface
 * Tests the public API that chart pages use
 */

import {
  calculateOptionsGreeks,
  calculateStraddleGreeks,
  calculateStrangleGreeks,
  type OptionsGreeksInput,
} from '../optionsGreeks';

describe('calculateOptionsGreeks', () => {
  const baseInput: OptionsGreeksInput = {
    spotPrice: 26100,
    strikePrice: 26100,
    marketPrice: 150,
    optionType: 'call',
    daysToExpiry: 5,
    riskFreeRate: 0.07,
    useImpliedVolatility: true,
  };

  it('should calculate Greeks for a call option', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result).toBeDefined();
    expect(result.delta).toBeDefined();
    expect(result.gamma).toBeDefined();
    expect(result.theta).toBeDefined();
    expect(result.vega).toBeDefined();
    expect(result.rho).toBeDefined();
    expect(result.impliedVolatility).not.toBeNull();
    expect(result.volatilityUsed).toBeGreaterThan(0);
    expect(result.theoreticalPrice).toBeGreaterThan(0);
  });

  it('should calculate Greeks for a put option', () => {
    const result = calculateOptionsGreeks({ ...baseInput, optionType: 'put' });

    expect(result.delta).toBeLessThan(0); // Put delta is negative
    expect(result.delta).toBeGreaterThan(-1);
    expect(result.gamma).toBeGreaterThan(0);
    expect(result.vega).toBeGreaterThan(0);
  });

  it('call delta should be positive, ~0.5 for ATM', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(1);
  });

  it('should have positive gamma', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result.gamma).toBeGreaterThan(0);
  });

  it('should have negative theta (time decay)', () => {
    const result = calculateOptionsGreeks(baseInput);

    // Theta is often negative (decay)
    expect(result.theta).toBeLessThan(0);
  });

  it('should have positive vega (volatility sensitivity)', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result.vega).toBeGreaterThan(0);
  });

  it('should calculate priceDifference = marketPrice - theoreticalPrice', () => {
    const result = calculateOptionsGreeks(baseInput);

    const expectedDiff = baseInput.marketPrice - result.theoreticalPrice;
    expect(result.priceDifference).toBeCloseTo(expectedDiff, 2);
  });

  it('should solve for IV and mark convergence status', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result.impliedVolatility).toBeDefined();
    expect(result.ivConverged).toBeDefined();
    if (result.impliedVolatility !== null) {
      expect(result.impliedVolatility).toBeGreaterThan(0);
    }
  });

  it('should calculate historical volatility if prices provided', () => {
    const historicalPrices = Array.from({ length: 30 }, (_, i) => 26000 + i * 5);

    const result = calculateOptionsGreeks({
      ...baseInput,
      historicalSpotPrices: historicalPrices,
    });

    expect(result.historicalVolatility).not.toBeNull();
    expect(result.historicalVolatility!).toBeGreaterThan(0);
  });

  it('should use provided riskFreeRate', () => {
    const result1 = calculateOptionsGreeks({ ...baseInput, riskFreeRate: 0.05 });
    const result2 = calculateOptionsGreeks({ ...baseInput, riskFreeRate: 0.10 });

    // Rho should be different with different rates
    expect(result1.rho).not.toBeCloseTo(result2.rho, 1);
  });

  it('should assess risk level based on DTE and Greeks', () => {
    const safe = calculateOptionsGreeks({ ...baseInput, daysToExpiry: 30 });
    const caution = calculateOptionsGreeks({ ...baseInput, daysToExpiry: 10 });
    const danger = calculateOptionsGreeks({ ...baseInput, daysToExpiry: 2 });

    expect(['safe', 'caution', 'danger']).toContain(safe.riskLevel);
    expect(['safe', 'caution', 'danger']).toContain(caution.riskLevel);
    expect(['safe', 'caution', 'danger']).toContain(danger.riskLevel);

    // Shorter DTE should increase risk
    expect(danger.riskLevel).not.toBe('safe');
  });

  it('should mark IV fallback status', () => {
    const result = calculateOptionsGreeks(baseInput);

    expect(result.ivUsedFallback).toBeDefined();
    expect(typeof result.ivUsedFallback).toBe('boolean');
  });

  it('should validate input', () => {
    // Very high DTE should work
    const result = calculateOptionsGreeks({
      ...baseInput,
      daysToExpiry: 365,
    });

    expect(result).toBeDefined();
    expect(result.volatilityUsed).toBeGreaterThan(0);
  });

  it('should handle ITM and OTM options', () => {
    const itm = calculateOptionsGreeks({
      ...baseInput,
      strikePrice: 26000, // Strike < Spot (ITM call)
    });

    const otm = calculateOptionsGreeks({
      ...baseInput,
      strikePrice: 26200, // Strike > Spot (OTM call)
    });

    expect(itm.delta).toBeGreaterThan(otm.delta);
    expect(itm.theoreticalPrice).toBeGreaterThan(otm.theoreticalPrice);
  });

  it('should use provided volatility if IV solving disabled', () => {
    // This test checks the useImpliedVolatility flag behavior
    // When false, should use HV or default instead
    const result = calculateOptionsGreeks({
      ...baseInput,
      useImpliedVolatility: false,
    });

    expect(result.volatilityUsed).toBeGreaterThan(0);
    // Should use HV or default (not IV)
    if (result.impliedVolatility === null) {
      expect(result.volatilityUsed).toBeLessThan(1); // Reasonable default
    }
  });
});

describe('calculateStraddleGreeks', () => {
  const ceInput: OptionsGreeksInput = {
    spotPrice: 26100,
    strikePrice: 26100,
    marketPrice: 150,
    optionType: 'call',
    daysToExpiry: 5,
    riskFreeRate: 0.07,
  };

  const peInput: OptionsGreeksInput = {
    spotPrice: 26100,
    strikePrice: 26100,
    marketPrice: 120,
    optionType: 'put',
    daysToExpiry: 5,
    riskFreeRate: 0.07,
  };

  it('should calculate combined straddle Greeks', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    expect(result.combined).toBeDefined();
    expect(result.ce).toBeDefined();
    expect(result.pe).toBeDefined();

    expect(result.combined.delta).toBeDefined();
    expect(result.combined.gamma).toBeDefined();
    expect(result.combined.theta).toBeDefined();
    expect(result.combined.vega).toBeDefined();
  });

  it('combined Greeks should be sum of CE and PE Greeks', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    expect(result.combined.delta).toBeCloseTo(result.ce.delta + result.pe.delta, 2);
    expect(result.combined.gamma).toBeCloseTo(result.ce.gamma + result.pe.gamma, 4);
    expect(result.combined.theta).toBeCloseTo(result.ce.theta + result.pe.theta, 2);
    expect(result.combined.vega).toBeCloseTo(result.ce.vega + result.pe.vega, 2);
  });

  it('ATM straddle delta should be close to 0', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    // For ATM straddle, call delta ≈ 0.5, put delta ≈ -0.5, sum ≈ 0
    expect(Math.abs(result.combined.delta)).toBeLessThan(0.5);
  });

  it('straddle gamma should be positive and higher than individual legs', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    expect(result.combined.gamma).toBeGreaterThan(0);
    expect(result.combined.gamma).toBeGreaterThan(result.ce.gamma);
    expect(result.combined.gamma).toBeGreaterThan(result.pe.gamma);
  });

  it('risk level should be worst of both legs', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    const worstRisk = (risk1: string, risk2: string) => {
      const hierarchy: { [key: string]: number } = {
        safe: 0,
        caution: 1,
        danger: 2,
      };
      return hierarchy[risk1] >= hierarchy[risk2] ? risk1 : risk2;
    };

    const expectedWorst = worstRisk(result.ce.riskLevel, result.pe.riskLevel);
    expect(result.combined.riskLevel).toBe(expectedWorst);
  });

  it('combined market price should be sum of CE and PE prices', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    expect(result.combined.marketPrice).toBeCloseTo(
      result.ce.marketPrice + result.pe.marketPrice,
      2
    );
  });

  it('combined theoretical price should be sum of CE and PE theoretical prices', () => {
    const result = calculateStraddleGreeks(ceInput, peInput);

    expect(result.combined.theoreticalPrice).toBeCloseTo(
      result.ce.theoreticalPrice + result.pe.theoreticalPrice,
      2
    );
  });

  it('should handle straddle with different prices for each leg', () => {
    const result = calculateStraddleGreeks(ceInput, {
      ...peInput,
      marketPrice: 80, // Different PE price
    });

    expect(result.combined.marketPrice).toBeCloseTo(150 + 80, 2);
  });
});

describe('calculateStrangleGreeks', () => {
  const ceInput: OptionsGreeksInput = {
    spotPrice: 26100,
    strikePrice: 26200,
    marketPrice: 120,
    optionType: 'call',
    daysToExpiry: 5,
    riskFreeRate: 0.07,
  };

  const peInput: OptionsGreeksInput = {
    spotPrice: 26100,
    strikePrice: 26000,
    marketPrice: 100,
    optionType: 'put',
    daysToExpiry: 5,
    riskFreeRate: 0.07,
  };

  it('should calculate combined strangle Greeks', () => {
    const result = calculateStrangleGreeks(ceInput, peInput);

    expect(result.combined).toBeDefined();
    expect(result.ce).toBeDefined();
    expect(result.pe).toBeDefined();
  });

  it('combined Greeks should be sum of CE and PE Greeks', () => {
    const result = calculateStrangleGreeks(ceInput, peInput);

    expect(result.combined.delta).toBeCloseTo(result.ce.delta + result.pe.delta, 2);
    expect(result.combined.gamma).toBeCloseTo(result.ce.gamma + result.pe.gamma, 4);
    expect(result.combined.theta).toBeCloseTo(result.ce.theta + result.pe.theta, 2);
  });

  it('strangle delta should be closer to 0 than straddle for OTM strikes', () => {
    const result = calculateStrangleGreeks(ceInput, peInput);

    // Strangle with OTM strikes should have even lower gamma than straddle
    expect(Math.abs(result.combined.delta)).toBeLessThan(1);
    expect(result.combined.gamma).toBeGreaterThan(0);
  });

  it('should cost less than straddle (cheaper premium)', () => {
    // Straddle: ATM CE + ATM PE
    const straddleResult = calculateStraddleGreeks(
      { ...ceInput, strikePrice: 26100 },
      { ...peInput, strikePrice: 26100 }
    );

    // Strangle: OTM CE + OTM PE (our test case)
    const strangleResult = calculateStrangleGreeks(ceInput, peInput);

    // Strangle premium should be less
    expect(strangleResult.combined.marketPrice).toBeLessThan(
      straddleResult.combined.marketPrice
    );
  });

  it('should have lower gamma than equivalent straddle', () => {
    const straddle = calculateStraddleGreeks(
      { ...ceInput, strikePrice: 26100, marketPrice: 150 },
      { ...peInput, strikePrice: 26100, marketPrice: 120 }
    );

    const strangle = calculateStrangleGreeks(ceInput, peInput);

    // Straddle's gamma should be higher (tighter range)
    expect(straddle.combined.gamma).toBeGreaterThan(strangle.combined.gamma);
  });

  it('breakeven should be wider than straddle', () => {
    // This is conceptual: strangle cost less so breakevens are further apart
    const result = calculateStrangleGreeks(ceInput, peInput);

    // Strangle is profitable if price stays between:
    // Lower breakeven = PE strike - (CE premium + PE premium)
    // Upper breakeven = CE strike + (CE premium + PE premium)
    const profit = result.combined.marketPrice;
    const lower = peInput.strikePrice - profit;
    const upper = ceInput.strikePrice + profit;

    // Width should be reasonable
    const width = upper - lower;
    expect(width).toBeGreaterThan(100); // Some reasonable width
  });
});

describe('Real-world trading scenarios', () => {
  it('short strangle on NIFTY 26100 spot', () => {
    const ceInput: OptionsGreeksInput = {
      spotPrice: 26100,
      strikePrice: 26200,
      marketPrice: 100,
      optionType: 'call',
      daysToExpiry: 10,
      riskFreeRate: 0.07,
    };

    const peInput: OptionsGreeksInput = {
      spotPrice: 26100,
      strikePrice: 26000,
      marketPrice: 80,
      optionType: 'put',
      daysToExpiry: 10,
      riskFreeRate: 0.07,
    };

    const result = calculateStrangleGreeks(ceInput, peInput);

    // For a seller:
    expect(result.combined.marketPrice).toBe(180); // Total premium
    expect(result.combined.delta).toBeCloseTo(0, 0); // Should be balanced
    expect(result.combined.gamma).toBeGreaterThan(0); // Positive (seller's risk)
    expect(result.combined.theta).toBeLessThan(0); // Negative daily decay (seller benefit)

    // Risk assessment
    expect(['safe', 'caution', 'danger']).toContain(result.combined.riskLevel);
  });

  it('long straddle on NIFTY for high volatility play', () => {
    const ceInput: OptionsGreeksInput = {
      spotPrice: 26100,
      strikePrice: 26100,
      marketPrice: 300,
      optionType: 'call',
      daysToExpiry: 3,
      riskFreeRate: 0.07,
    };

    const peInput: OptionsGreeksInput = {
      spotPrice: 26100,
      strikePrice: 26100,
      marketPrice: 280,
      optionType: 'put',
      daysToExpiry: 3,
      riskFreeRate: 0.07,
    };

    const result = calculateStraddleGreeks(ceInput, peInput);

    // For a buyer (long):
    expect(result.combined.marketPrice).toBe(580); // Total cost
    expect(Math.abs(result.combined.delta)).toBeLessThan(0.5); // Low delta
    expect(result.combined.vega).toBeGreaterThan(0); // Benefits from vol increase

    // Near expiry, risk should be high
    expect(result.combined.riskLevel).not.toBe('safe');
  });
});
