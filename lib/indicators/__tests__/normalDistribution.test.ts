/**
 * Unit tests for Normal Distribution functions
 * Tests CDF, PDF, d1, d2 calculations against known values
 */

import { normalCDF, normalPDF, calculateD1, calculateD2 } from '../normalDistribution';

describe('Normal Distribution Functions', () => {
  describe('normalPDF', () => {
    it('should return ~0.3989 for input 0', () => {
      const result = normalPDF(0);
      expect(result).toBeCloseTo(0.3989, 3);
    });

    it('should return ~0.2420 for input 1', () => {
      const result = normalPDF(1);
      expect(result).toBeCloseTo(0.2420, 3);
    });

    it('should return ~0.2420 for input -1 (symmetry)', () => {
      const result = normalPDF(-1);
      expect(result).toBeCloseTo(0.2420, 3);
    });

    it('should return ~0.0540 for input 2', () => {
      const result = normalPDF(2);
      expect(result).toBeCloseTo(0.0540, 3);
    });

    it('should be symmetric around zero', () => {
      const positive = normalPDF(1.5);
      const negative = normalPDF(-1.5);
      expect(positive).toBeCloseTo(negative, 10);
    });

    it('should decrease as input moves away from zero', () => {
      const zero = normalPDF(0);
      const one = normalPDF(1);
      const two = normalPDF(2);
      expect(zero > one && one > two).toBe(true);
    });
  });

  describe('normalCDF', () => {
    it('should return 0.5 for input 0', () => {
      const result = normalCDF(0);
      expect(result).toBeCloseTo(0.5, 4);
    });

    it('should return ~0.8413 for input 1', () => {
      const result = normalCDF(1);
      expect(result).toBeCloseTo(0.8413, 3);
    });

    it('should return ~0.1587 for input -1', () => {
      const result = normalCDF(-1);
      expect(result).toBeCloseTo(0.1587, 3);
    });

    it('should return ~0.9772 for input 2', () => {
      const result = normalCDF(2);
      expect(result).toBeCloseTo(0.9772, 3);
    });

    it('should return ~0.9987 for input 3', () => {
      const result = normalCDF(3);
      expect(result).toBeCloseTo(0.9987, 3);
    });

    it('should satisfy CDF(-x) = 1 - CDF(x)', () => {
      const x = 1.5;
      const cdfPos = normalCDF(x);
      const cdfNeg = normalCDF(-x);
      expect(cdfPos + cdfNeg).toBeCloseTo(1, 10);
    });

    it('should be monotonically increasing', () => {
      const cdf1 = normalCDF(-2);
      const cdf2 = normalCDF(-1);
      const cdf3 = normalCDF(0);
      const cdf4 = normalCDF(1);
      const cdf5 = normalCDF(2);
      expect(cdf1 < cdf2 && cdf2 < cdf3 && cdf3 < cdf4 && cdf4 < cdf5).toBe(true);
    });

    it('should approach 0 for very negative values', () => {
      const result = normalCDF(-5);
      expect(result).toBeLessThan(0.0001);
    });

    it('should approach 1 for very positive values', () => {
      const result = normalCDF(5);
      expect(result).toBeGreaterThan(0.9999);
    });
  });

  describe('calculateD1', () => {
    // Black-Scholes test case:
    // S=100, K=100, T=1, r=0.05, sigma=0.2
    // d1 = [ln(100/100) + (0.05 + 0.04/2)*1] / (0.2*sqrt(1))
    // d1 = [0 + 0.07] / 0.2 = 0.35
    it('should calculate d1 for ATM option with standard inputs', () => {
      const d1 = calculateD1({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      expect(d1).toBeCloseTo(0.35, 2);
    });

    it('should be positive for ITM call (S > K)', () => {
      const d1 = calculateD1({
        S: 110,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      expect(d1).toBeGreaterThan(0.35);
    });

    it('should be negative for OTM call (S < K)', () => {
      const d1 = calculateD1({
        S: 90,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      expect(d1).toBeLessThan(0.35);
    });

    it('should increase with higher volatility', () => {
      const d1Low = calculateD1({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.1,
      });
      const d1High = calculateD1({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.3,
      });
      expect(d1High).toBeGreaterThan(d1Low);
    });

    it('should increase with longer time to expiry', () => {
      const d1Short = calculateD1({
        S: 100,
        K: 100,
        T: 0.1,
        r: 0.05,
        sigma: 0.2,
      });
      const d1Long = calculateD1({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      expect(d1Long).toBeGreaterThan(d1Short);
    });
  });

  describe('calculateD2', () => {
    // d2 = d1 - sigma * sqrt(T)
    it('should be less than d1 for positive sigma*sqrt(T)', () => {
      const d1 = calculateD1({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      const d2 = calculateD2({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.2,
      });
      expect(d2).toBeLessThan(d1);
    });

    it('should satisfy d2 = d1 - sigma*sqrt(T)', () => {
      const inputs = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 };
      const d1 = calculateD1(inputs);
      const d2 = calculateD2(inputs);
      const diff = d1 - (0.2 * Math.sqrt(1));
      expect(d2).toBeCloseTo(diff, 10);
    });

    it('should decrease with higher volatility (more discount from d1)', () => {
      const d2Low = calculateD2({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.1,
      });
      const d2High = calculateD2({
        S: 100,
        K: 100,
        T: 1,
        r: 0.05,
        sigma: 0.3,
      });
      expect(d2Low).toBeGreaterThan(d2High);
    });
  });

  describe('Integration tests', () => {
    it('CDF(d1) and CDF(d2) should be used for option pricing', () => {
      // This is a sanity check that the functions work together
      const inputs = {
        S: 26100,
        K: 26100,
        T: 5 / 365,
        r: 0.07,
        sigma: 0.25,
      };

      const d1 = calculateD1(inputs);
      const d2 = calculateD2(inputs);

      expect(d1).toBeDefined();
      expect(d2).toBeDefined();
      expect(d1 > d2).toBe(true);

      // CDFs should be between 0 and 1
      const cdfD1 = normalCDF(d1);
      const cdfD2 = normalCDF(d2);

      expect(cdfD1).toBeGreaterThan(0);
      expect(cdfD1).toBeLessThan(1);
      expect(cdfD2).toBeGreaterThan(0);
      expect(cdfD2).toBeLessThan(1);
    });
  });
});
