/**
 * Unit tests for Black-Scholes option pricing and Greeks
 * Validates pricing formulas and Greeks calculations
 */

import { callPrice, putPrice, optionPrice, delta, gamma, theta, vega, rho, calculateAllGreeks } from '../blackScholes';

describe('Black-Scholes Option Pricing', () => {
  // Standard test case: ATM call option
  const standardInputs = {
    S: 100,
    K: 100,
    T: 1,
    r: 0.05,
    sigma: 0.2,
    optionType: 'call' as const,
  };

  describe('callPrice', () => {
    it('should calculate call price for ATM option', () => {
      const price = callPrice(standardInputs);
      // Approximate theoretical value for these inputs
      expect(price).toBeCloseTo(10.45, 1);
    });

    it('should be higher for ITM call', () => {
      const atmPrice = callPrice(standardInputs);
      const itmPrice = callPrice({ ...standardInputs, S: 110 });
      expect(itmPrice).toBeGreaterThan(atmPrice);
    });

    it('should be lower for OTM call', () => {
      const atmPrice = callPrice(standardInputs);
      const otmPrice = callPrice({ ...standardInputs, S: 90 });
      expect(otmPrice).toBeLessThan(atmPrice);
    });

    it('should increase with higher volatility', () => {
      const lowVolPrice = callPrice({ ...standardInputs, sigma: 0.1 });
      const highVolPrice = callPrice({ ...standardInputs, sigma: 0.3 });
      expect(highVolPrice).toBeGreaterThan(lowVolPrice);
    });

    it('should increase with longer time to expiry', () => {
      const shortPrice = callPrice({ ...standardInputs, T: 0.1 });
      const longPrice = callPrice({ ...standardInputs, T: 1 });
      expect(longPrice).toBeGreaterThan(shortPrice);
    });

    it('should have intrinsic value at expiry (T→0)', () => {
      const itmCall = callPrice({ ...standardInputs, T: 0.001, S: 110, K: 100 });
      expect(itmCall).toBeCloseTo(10, 1); // Intrinsic value ≈ S - K = 10
    });

    it('should be 0 for deep OTM call at expiry', () => {
      const otmCall = callPrice({ ...standardInputs, T: 0.001, S: 90, K: 100 });
      expect(otmCall).toBeCloseTo(0, 2);
    });
  });

  describe('putPrice', () => {
    it('should calculate put price for ATM option', () => {
      const price = putPrice({ ...standardInputs, optionType: 'put' });
      // Approximate theoretical value
      expect(price).toBeCloseTo(5.57, 1);
    });

    it('should satisfy put-call parity: C - P = S - K*e^(-rT)', () => {
      const cPrice = callPrice(standardInputs);
      const pPrice = putPrice({ ...standardInputs, optionType: 'put' });
      const discountFactor = Math.exp(-standardInputs.r * standardInputs.T);
      const parity = standardInputs.S - standardInputs.K * discountFactor;
      const difference = cPrice - pPrice;
      expect(difference).toBeCloseTo(parity, 1);
    });

    it('should be higher for ITM put', () => {
      const atmPrice = putPrice({ ...standardInputs, optionType: 'put' });
      const itmPrice = putPrice({ ...standardInputs, S: 90, optionType: 'put' });
      expect(itmPrice).toBeGreaterThan(atmPrice);
    });

    it('should increase with higher volatility', () => {
      const lowVolPrice = putPrice({ ...standardInputs, sigma: 0.1, optionType: 'put' });
      const highVolPrice = putPrice({ ...standardInputs, sigma: 0.3, optionType: 'put' });
      expect(highVolPrice).toBeGreaterThan(lowVolPrice);
    });
  });

  describe('optionPrice (wrapper)', () => {
    it('should return same as callPrice for call option', () => {
      const direct = callPrice(standardInputs);
      const wrapper = optionPrice(standardInputs);
      expect(wrapper).toBeCloseTo(direct, 10);
    });

    it('should return same as putPrice for put option', () => {
      const direct = putPrice({ ...standardInputs, optionType: 'put' });
      const wrapper = optionPrice({ ...standardInputs, optionType: 'put' });
      expect(wrapper).toBeCloseTo(direct, 10);
    });
  });

  describe('Delta', () => {
    it('call delta should be ~0.5 for ATM option', () => {
      const d = delta(standardInputs);
      expect(d).toBeCloseTo(0.5, 1);
    });

    it('call delta should be ~1 for deep ITM call', () => {
      const d = delta({ ...standardInputs, S: 150 });
      expect(d).toBeGreaterThan(0.9);
    });

    it('call delta should be ~0 for deep OTM call', () => {
      const d = delta({ ...standardInputs, S: 50 });
      expect(d).toBeLessThan(0.1);
    });

    it('put delta should be ~-0.5 for ATM option', () => {
      const d = delta({ ...standardInputs, optionType: 'put' });
      expect(d).toBeCloseTo(-0.5, 1);
    });

    it('put delta should be close to -1 for deep ITM put', () => {
      const d = delta({ ...standardInputs, S: 50, optionType: 'put' });
      expect(d).toBeLessThan(-0.9);
    });

    it('delta should be between 0 and 1 for call, -1 and 0 for put', () => {
      const callD = delta(standardInputs);
      const putD = delta({ ...standardInputs, optionType: 'put' });
      expect(callD).toBeGreaterThan(0);
      expect(callD).toBeLessThan(1);
      expect(putD).toBeGreaterThan(-1);
      expect(putD).toBeLessThan(0);
    });
  });

  describe('Gamma', () => {
    it('should be positive for both calls and puts', () => {
      const callGamma = gamma(standardInputs);
      const putGamma = gamma({ ...standardInputs, optionType: 'put' });
      expect(callGamma).toBeGreaterThan(0);
      expect(putGamma).toBeGreaterThan(0);
    });

    it('should be highest for ATM options', () => {
      const atmGamma = gamma(standardInputs);
      const itmGamma = gamma({ ...standardInputs, S: 110 });
      const otmGamma = gamma({ ...standardInputs, S: 90 });
      expect(atmGamma).toBeGreaterThan(itmGamma);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });

    it('should increase with shorter time to expiry', () => {
      const longGamma = gamma({ ...standardInputs, T: 1 });
      const shortGamma = gamma({ ...standardInputs, T: 0.1 });
      expect(shortGamma).toBeGreaterThan(longGamma);
    });

    it('should increase with lower volatility', () => {
      const highVolGamma = gamma({ ...standardInputs, sigma: 0.4 });
      const lowVolGamma = gamma({ ...standardInputs, sigma: 0.1 });
      expect(lowVolGamma).toBeGreaterThan(highVolGamma);
    });

    it('should be equal for calls and puts', () => {
      const callGamma = gamma(standardInputs);
      const putGamma = gamma({ ...standardInputs, optionType: 'put' });
      expect(callGamma).toBeCloseTo(putGamma, 10);
    });
  });

  describe('Theta', () => {
    it('call theta should typically be negative (time decay)', () => {
      const callTheta = theta(standardInputs);
      expect(callTheta).toBeLessThan(0);
    });

    it('put theta should typically be negative for OTM puts', () => {
      const putTheta = theta({ ...standardInputs, S: 90, optionType: 'put' });
      expect(putTheta).toBeLessThan(0);
    });

    it('theta should be higher magnitude for options near expiry', () => {
      const longTheta = theta({ ...standardInputs, T: 1 });
      const shortTheta = theta({ ...standardInputs, T: 0.1 });
      // Near expiry has higher magnitude theta
      expect(Math.abs(shortTheta)).toBeGreaterThan(Math.abs(longTheta));
    });

    it('should represent daily decay (divided by 365)', () => {
      // Theta value is per day (1/365 year)
      const thetaValue = theta(standardInputs);
      expect(Math.abs(thetaValue)).toBeLessThan(0.1); // Daily decay should be < 0.1
    });
  });

  describe('Vega', () => {
    it('should be positive for both calls and puts', () => {
      const callVega = vega(standardInputs);
      const putVega = vega({ ...standardInputs, optionType: 'put' });
      expect(callVega).toBeGreaterThan(0);
      expect(putVega).toBeGreaterThan(0);
    });

    it('should be highest for ATM options', () => {
      const atmVega = vega(standardInputs);
      const itmVega = vega({ ...standardInputs, S: 110 });
      const otmVega = vega({ ...standardInputs, S: 90 });
      expect(atmVega).toBeGreaterThan(itmVega);
      expect(atmVega).toBeGreaterThan(otmVega);
    });

    it('should increase with longer time to expiry', () => {
      const shortVega = vega({ ...standardInputs, T: 0.1 });
      const longVega = vega({ ...standardInputs, T: 1 });
      expect(longVega).toBeGreaterThan(shortVega);
    });

    it('should be equal for calls and puts', () => {
      const callVega = vega(standardInputs);
      const putVega = vega({ ...standardInputs, optionType: 'put' });
      expect(callVega).toBeCloseTo(putVega, 10);
    });

    it('should represent sensitivity per 1% volatility change', () => {
      const vegaValue = vega(standardInputs);
      expect(vegaValue).toBeGreaterThan(0);
      expect(vegaValue).toBeLessThan(100); // Reasonable range
    });
  });

  describe('Rho', () => {
    it('call rho should be positive', () => {
      const callRho = rho(standardInputs);
      expect(callRho).toBeGreaterThan(0);
    });

    it('put rho should be negative', () => {
      const putRho = rho({ ...standardInputs, optionType: 'put' });
      expect(putRho).toBeLessThan(0);
    });

    it('rho should increase with time to expiry', () => {
      const shortRho = Math.abs(rho({ ...standardInputs, T: 0.1 }));
      const longRho = Math.abs(rho({ ...standardInputs, T: 1 }));
      expect(longRho).toBeGreaterThan(shortRho);
    });

    it('should be smaller than other Greeks for short-dated options', () => {
      const callRho = Math.abs(rho({ ...standardInputs, T: 0.01 }));
      const callDelta = Math.abs(delta({ ...standardInputs, T: 0.01 }));
      expect(callRho).toBeLessThan(callDelta);
    });
  });

  describe('calculateAllGreeks', () => {
    it('should return all Greeks in one call', () => {
      const greeks = calculateAllGreeks(standardInputs);
      expect(greeks.price).toBeDefined();
      expect(greeks.delta).toBeDefined();
      expect(greeks.gamma).toBeDefined();
      expect(greeks.theta).toBeDefined();
      expect(greeks.vega).toBeDefined();
      expect(greeks.rho).toBeDefined();
    });

    it('should match individual Greek calculations', () => {
      const greeks = calculateAllGreeks(standardInputs);
      const individualDelta = delta(standardInputs);
      const individualGamma = gamma(standardInputs);
      const individualTheta = theta(standardInputs);
      const individualVega = vega(standardInputs);

      expect(greeks.delta).toBeCloseTo(individualDelta, 10);
      expect(greeks.gamma).toBeCloseTo(individualGamma, 10);
      expect(greeks.theta).toBeCloseTo(individualTheta, 10);
      expect(greeks.vega).toBeCloseTo(individualVega, 10);
    });

    it('should handle straddle Greeks (both call and put)', () => {
      const callGreeks = calculateAllGreeks(standardInputs);
      const putGreeks = calculateAllGreeks({ ...standardInputs, optionType: 'put' });

      // Straddle Greeks are sum of call + put
      const straddlePrice = callGreeks.price + putGreeks.price;
      const straddleDelta = callGreeks.delta + putGreeks.delta; // Should ≈ 0 for ATM
      const straddleGamma = callGreeks.gamma + putGreeks.gamma; // Should be positive
      const straddleTheta = callGreeks.theta + putGreeks.theta; // Additive
      const straddleVega = callGreeks.vega + putGreeks.vega; // Additive

      expect(straddlePrice).toBeGreaterThan(0);
      expect(Math.abs(straddleDelta)).toBeLessThan(0.5); // Near ATM should be close to 0
      expect(straddleGamma).toBeGreaterThan(0);
      // Theta and Vega signs depend on seller/buyer
    });
  });

  describe('Real-world scenarios', () => {
    it('short strangle (sell 26200 CE, sell 26000 PE)', () => {
      const inputs = {
        S: 26100,
        T: 5 / 365,
        r: 0.07,
        sigma: 0.25,
      };

      const ce = calculateAllGreeks({ ...inputs, K: 26200, optionType: 'call' });
      const pe = calculateAllGreeks({ ...inputs, K: 26000, optionType: 'put' });

      // For a strangle seller:
      // - Total premium collected = CE price + PE price
      // - Profit if price stays between 26000-26200
      // - Delta should be near 0 (balanced)
      // - Theta should be positive (seller profits from time decay)
      // - Gamma should be positive but manageable

      expect(ce.price).toBeGreaterThan(0);
      expect(pe.price).toBeGreaterThan(0);
      expect(ce.delta).toBeGreaterThan(0); // CE delta positive
      expect(pe.delta).toBeLessThan(0); // PE delta negative
      expect(Math.abs(ce.delta + pe.delta)).toBeLessThan(1); // Net delta should be balanced
    });

    it('should reflect Greeks changing as spot price moves', () => {
      const baseInputs = {
        K: 100,
        T: 0.1,
        r: 0.05,
        sigma: 0.2,
        optionType: 'call' as const,
      };

      const athGreeks = calculateAllGreeks({ ...baseInputs, S: 100 });
      const itmGreeks = calculateAllGreeks({ ...baseInputs, S: 105 });
      const otmGreeks = calculateAllGreeks({ ...baseInputs, S: 95 });

      // Delta increases as price moves up for calls
      expect(itmGreeks.delta).toBeGreaterThan(athGreeks.delta);
      expect(athGreeks.delta).toBeGreaterThan(otmGreeks.delta);

      // Price increases with higher spot for calls
      expect(itmGreeks.price).toBeGreaterThan(athGreeks.price);
      expect(athGreeks.price).toBeGreaterThan(otmGreeks.price);
    });
  });
});
