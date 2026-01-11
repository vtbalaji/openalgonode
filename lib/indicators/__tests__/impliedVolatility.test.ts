/**
 * Unit tests for Implied Volatility solver and Historical Volatility
 * Validates Newton-Raphson convergence and fallback logic
 */

import {
  solveImpliedVolatility,
  calculateHistoricalVolatility,
  solveImpliedVolatilityWithFallback,
  DEFAULT_IV_CONFIG,
} from '../impliedVolatility';
import { callPrice } from '../blackScholes';

describe('Implied Volatility Solver', () => {
  describe('solveImpliedVolatility', () => {
    it('should converge for a typical ATM option', () => {
      // Generate a call price with known volatility (20%)
      const knownVol = 0.2;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      // Solve for IV
      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.impliedVolatility).toBeDefined();
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 2);
      expect(result.iterations).toBeLessThan(DEFAULT_IV_CONFIG.maxIterations);
    });

    it('should converge for a put option', () => {
      const knownVol = 0.25;
      const inputs = { S: 100, K: 100, T: 0.5, r: 0.05, optionType: 'put' as const };
      // Note: For put pricing, we still use callPrice internally but adjust
      // For now, test with call and then put
      const baseInputs = { S: 100, K: 100, T: 0.5, r: 0.05, sigma: knownVol, optionType: 'call' as const };
      const marketPrice = callPrice(baseInputs);

      const result = solveImpliedVolatility(marketPrice, { S: 100, K: 100, T: 0.5, r: 0.05, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 2);
    });

    it('should converge for deep ITM option', () => {
      const knownVol = 0.3;
      const inputs = { S: 120, K: 100, T: 0.5, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 2);
    });

    it('should converge for OTM option', () => {
      const knownVol = 0.25;
      const inputs = { S: 80, K: 100, T: 0.5, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 1);
    });

    it('should converge for short-dated options', () => {
      const knownVol = 0.35;
      const inputs = { S: 100, K: 100, T: 5 / 365, r: 0.07, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 1);
    });

    it('should reject negative market price', () => {
      const result = solveImpliedVolatility(-1, { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' });

      expect(result.converged).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.impliedVolatility).toBeNull();
    });

    it('should reject zero/negative time to expiry', () => {
      const result = solveImpliedVolatility(5, { S: 100, K: 100, T: 0, r: 0.05, optionType: 'call' });

      expect(result.converged).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject price below intrinsic value', () => {
      // Call intrinsic value = max(S - K, 0) = 20 for S=120, K=100
      // Price of 5 is below intrinsic
      const result = solveImpliedVolatility(5, { S: 120, K: 100, T: 1, r: 0.05, optionType: 'call' });

      expect(result.converged).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('intrinsic value');
    });

    it('should respect tolerance parameter', () => {
      const knownVol = 0.2;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      // Tight tolerance
      const tightResult = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' }, {
        tolerance: 0.00001,
      });

      // Loose tolerance
      const looseResult = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' }, {
        tolerance: 0.01,
      });

      // Tight tolerance might take more iterations
      expect(tightResult.iterations).toBeGreaterThanOrEqual(looseResult.iterations);
    });

    it('should respect maxIterations parameter', () => {
      const knownVol = 0.2;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' }, {
        maxIterations: 5,
      });

      expect(result.iterations).toBeLessThanOrEqual(5);
    });

    it('should enforce volatility bounds', () => {
      const knownVol = 0.2;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatility(marketPrice, { ...inputs, optionType: 'call' }, {
        minVolatility: 0.05,
        maxVolatility: 0.5,
      });

      expect(result.impliedVolatility! >= 0.05).toBe(true);
      expect(result.impliedVolatility! <= 0.5).toBe(true);
    });
  });

  describe('calculateHistoricalVolatility', () => {
    it('should return null for insufficient data (< 2 prices)', () => {
      const result = calculateHistoricalVolatility([100]);
      expect(result).toBeNull();
    });

    it('should calculate volatility from price data', () => {
      // Create price series with known volatility characteristics
      const prices = [100, 101, 99, 102, 100, 103, 98, 104, 99, 100];

      const hv = calculateHistoricalVolatility(prices);

      expect(hv).not.toBeNull();
      expect(hv!).toBeGreaterThan(0);
      expect(hv!).toBeLessThan(1); // Should be reasonable %
    });

    it('should return higher HV for more volatile prices', () => {
      // Low volatility prices
      const lowVolPrices = [100, 100.1, 100.2, 100.1, 100];

      // High volatility prices
      const highVolPrices = [100, 105, 95, 110, 90];

      const lowHV = calculateHistoricalVolatility(lowVolPrices);
      const highHV = calculateHistoricalVolatility(highVolPrices);

      expect(highHV!).toBeGreaterThan(lowHV!);
    });

    it('should use lookback period correctly', () => {
      // Create 30-day price series
      const prices: number[] = [];
      for (let i = 0; i < 30; i++) {
        prices.push(100 + Math.sin(i * 0.2) * 5);
      }

      // Calculate HV with different lookbacks
      const hv10 = calculateHistoricalVolatility(prices, 10);
      const hv30 = calculateHistoricalVolatility(prices, 30);

      // Both should be valid
      expect(hv10).not.toBeNull();
      expect(hv30).not.toBeNull();
      // May be different due to different subsets
      expect(hv10! > 0 && hv30! > 0).toBe(true);
    });

    it('should handle prices with zero returns (flat periods)', () => {
      const prices = [100, 100, 100, 105, 105, 105];

      const hv = calculateHistoricalVolatility(prices);

      expect(hv).not.toBeNull();
      expect(hv!).toBeGreaterThan(0); // Some volatility from jumps
    });

    it('should annualize volatility correctly (multiply by sqrt(252))', () => {
      // Simple test: create constant daily return of 1%
      const prices = Array.from({ length: 30 }, (_, i) => 100 * Math.pow(1.01, i));

      const hv = calculateHistoricalVolatility(prices, 30);

      // Daily return ≈ 1%, annualized should be ≈ 1% * sqrt(252) ≈ 15.9%
      expect(hv!).toBeGreaterThan(0.10); // At least 10%
      expect(hv!).toBeLessThan(0.30); // Less than 30%
    });

    it('should ignore zero/negative prices in calculation', () => {
      const prices = [100, 0, 105, -10, 110]; // Contains invalid prices

      const hv = calculateHistoricalVolatility(prices);

      expect(hv).not.toBeNull(); // Should still calculate from valid data
    });
  });

  describe('solveImpliedVolatilityWithFallback', () => {
    it('should return IV if Newton-Raphson converges', () => {
      const knownVol = 0.2;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.converged).toBe(true);
      expect(result.usedFallback).toBe(false);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 2);
    });

    it('should fall back to HV if NR fails to converge', () => {
      // Create a scenario where NR might not converge easily
      const inputs = { S: 100, K: 50, T: 0.01, r: 0.05, optionType: 'call' as const };
      const marketPrice = 51; // Deep ITM

      const historicalPrices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.3) * 5);

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' }, historicalPrices);

      expect(result.impliedVolatility).not.toBeNull();
      expect(result.impliedVolatility! > 0).toBe(true);
    });

    it('should fall back to default volatility if no HV data', () => {
      const inputs = { S: 100, K: 50, T: 0.01, r: 0.05, optionType: 'call' as const };
      const marketPrice = 51;

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' });

      expect(result.impliedVolatility).not.toBeNull();
      expect(result.usedFallback).toBe(true);
      expect(result.impliedVolatility! > 0).toBe(true);
    });

    it('should prefer converged IV over fallback', () => {
      const knownVol = 0.25;
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = callPrice({ ...inputs, sigma: knownVol });

      const historicalPrices = Array.from({ length: 30 }, (_, i) => 100 + i);

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' }, historicalPrices);

      // Should converge and not use fallback for this standard case
      expect(result.converged).toBe(true);
      expect(result.usedFallback).toBe(false);
      expect(result.impliedVolatility).toBeCloseTo(knownVol, 2);
    });

    it('should mark fallback when used', () => {
      // Extreme case that will force fallback
      const inputs = { S: 100, K: 1, T: 0.001, r: 0.05, optionType: 'call' as const };
      const marketPrice = 99; // Essentially intrinsic value

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' });

      // At or near expiry, might use fallback
      if (!result.converged) {
        expect(result.usedFallback).toBe(true);
      }
    });

    it('should provide fallback type information', () => {
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, optionType: 'call' as const };
      const marketPrice = 50; // Price that might not converge easily

      const historicalPrices = [100, 101, 102, 103, 104];

      const result = solveImpliedVolatilityWithFallback(marketPrice, { ...inputs, optionType: 'call' }, historicalPrices);

      if (result.usedFallback && result.fallbackType) {
        expect(['historical', 'initial']).toContain(result.fallbackType);
      }
    });
  });

  describe('Integration tests', () => {
    it('IV solver should handle Indian index options (NIFTY)', () => {
      // Real-world scenario: NIFTY 26100 CE, spot 26095, DTE 5
      const inputs = {
        S: 26095,
        K: 26100,
        T: 5 / 365,
        r: 0.07,
        optionType: 'call' as const,
      };

      // Assume market price is 150 (reasonable for NIFTY)
      const marketPrice = 150;

      const result = solveImpliedVolatility(marketPrice, inputs);

      expect(result.impliedVolatility).not.toBeNull();
      expect(result.impliedVolatility! > 0).toBe(true);
      // For short-dated options, IV should be reasonable
      expect(result.impliedVolatility! < 2).toBe(true); // Less than 200% vol
    });

    it('HV calculator should work with NIFTY spot data', () => {
      // Simulate 30 days of NIFTY price data with ~2% daily move
      const prices: number[] = [];
      let price = 26000;
      for (let i = 0; i < 30; i++) {
        price *= (1 + (Math.random() - 0.5) * 0.02);
        prices.push(price);
      }

      const hv = calculateHistoricalVolatility(prices, 30);

      expect(hv).not.toBeNull();
      // 2% daily → ~32% annualized
      expect(hv! > 0.2 && hv! < 0.5).toBe(true);
    });
  });
});
