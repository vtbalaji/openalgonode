/**
 * Normal Distribution Functions
 *
 * Provides statistical functions required for Black-Scholes option pricing:
 * - CDF (Cumulative Distribution Function): Φ(x)
 * - PDF (Probability Density Function): φ(x)
 * - d1 and d2 parameters for Black-Scholes formula
 *
 * Uses Abramowitz and Stegun approximation for CDF with accuracy < 7.5e-8
 */

/**
 * Standard Normal CDF using Abramowitz and Stegun approximation
 * Φ(x) = P(X ≤ x) where X ~ N(0,1)
 *
 * Accuracy: Maximum error < 7.5 × 10^-8
 *
 * Formula for x ≥ 0:
 *   Φ(x) = 1 - φ(x) * (a₁*k + a₂*k² + a₃*k³ + a₄*k⁴ + a₅*k⁵)
 *   where k = 1 / (1 + γ*x)
 *
 * For x < 0:
 *   Φ(x) = 1 - Φ(-x)
 *
 * @param x - Input value
 * @returns Cumulative probability P(X ≤ x)
 */
export function normalCDF(x: number): number {
  // Abramowitz and Stegun constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const gamma = 0.3275911;

  // Handle the sign of x
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  // Calculate k
  const k = 1.0 / (1.0 + gamma * absX);

  // Get PDF value at |x|
  const pdfValue = normalPDF(absX);

  // Polynomial approximation
  const poly =
    a1 * k +
    a2 * Math.pow(k, 2) +
    a3 * Math.pow(k, 3) +
    a4 * Math.pow(k, 4) +
    a5 * Math.pow(k, 5);

  // CDF value for positive x
  let cdf = 1.0 - pdfValue * poly;

  // Apply sign
  if (sign < 0) {
    cdf = 1.0 - cdf;
  }

  return cdf;
}

/**
 * Standard Normal PDF (Probability Density Function)
 * φ(x) = (1/√(2π)) * e^(-x²/2)
 *
 * Height of the normal distribution curve at point x
 *
 * @param x - Input value
 * @returns Probability density at x
 */
export function normalPDF(x: number): number {
  const sqrt2Pi = Math.sqrt(2.0 * Math.PI);
  return Math.exp(-0.5 * x * x) / sqrt2Pi;
}

/**
 * Calculate d1 parameter for Black-Scholes model
 *
 * Formula: d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
 *
 * Where:
 * - S = Spot price
 * - K = Strike price
 * - T = Time to expiry (years)
 * - r = Risk-free rate
 * - σ = Volatility (implied or historical)
 *
 * d1 is used to calculate both option price and Greeks
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry (years)
 * @param r - Risk-free rate (decimal, e.g., 0.07 for 7%)
 * @param sigma - Volatility (decimal, e.g., 0.20 for 20%)
 * @returns d1 value
 */
export function calculateD1(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  if (T <= 0) {
    // At expiration, d1 is undefined, return sign of S - K
    return S > K ? Infinity : S < K ? -Infinity : 0;
  }

  const numerator = Math.log(S / K) + (r + 0.5 * sigma * sigma) * T;
  const denominator = sigma * Math.sqrt(T);

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

/**
 * Calculate d2 parameter for Black-Scholes model
 *
 * Formula: d2 = d1 - σ√T
 *
 * d2 is used in the Φ(d2) term for option pricing
 *
 * @param d1 - Pre-calculated d1 value
 * @param sigma - Volatility
 * @param T - Time to expiry (years)
 * @returns d2 value
 */
export function calculateD2(
  d1: number,
  sigma: number,
  T: number
): number {
  if (T <= 0) {
    return d1;
  }

  return d1 - sigma * Math.sqrt(T);
}
