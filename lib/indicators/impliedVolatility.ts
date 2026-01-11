/**
 * Implied Volatility Solver
 *
 * Solves for Implied Volatility (IV) from market option prices using:
 * - Newton-Raphson iterative method (most accurate)
 * - Historical Volatility fallback (if NR doesn't converge)
 * - Default volatility fallback (if no historical data)
 *
 * IV is the volatility that makes Black-Scholes price = market price
 *
 * Key Concept:
 * Market traders price options using IV instead of historical volatility.
 * IV reflects market expectations of future volatility.
 * If IV > HV: Market expects bigger moves than historical suggests
 * If IV < HV: Market expects smaller moves than historical suggests
 */

import { optionPrice, vega } from './blackScholes';
import type { BlackScholesInputs } from './blackScholes';

/**
 * Configuration for Newton-Raphson IV solver
 */
export interface IVSolverConfig {
  maxIterations: number; // Maximum iterations (safety limit)
  tolerance: number; // Convergence tolerance (price diff)
  initialGuess: number; // Starting volatility guess
  minVolatility: number; // Minimum allowed volatility
  maxVolatility: number; // Maximum allowed volatility
}

/**
 * Result from IV solver
 */
export interface IVSolverResult {
  impliedVolatility: number | null; // Solved IV or fallback value
  iterations: number; // Number of iterations performed
  converged: boolean; // Whether algorithm converged
  error: string | null; // Error message if any
  usedFallback: boolean; // Whether fallback was used
  fallbackType?: 'historical' | 'initial' | 'intrinsic'; // Type of fallback used
}

/**
 * Default configuration for IV solver
 *
 * - maxIterations: 100 (usually converges in 5-10 iterations)
 * - tolerance: 0.0001 (0.01% price accuracy, very tight)
 * - initialGuess: 0.20 (20% volatility as starting point)
 * - minVolatility: 0.01 (1%, floor to prevent negative vol)
 * - maxVolatility: 3.0 (300%, ceiling for extreme cases)
 */
export const DEFAULT_IV_CONFIG: IVSolverConfig = {
  maxIterations: 100,
  tolerance: 0.0001,
  initialGuess: 0.2,
  minVolatility: 0.01,
  maxVolatility: 3.0,
};

/**
 * Newton-Raphson method to solve for Implied Volatility
 *
 * Algorithm:
 * ──────────
 * 1. Start with initial guess σ₀
 * 2. Calculate option price at σₙ: V(σₙ)
 * 3. Calculate vega at σₙ: ∂V/∂σ (sensitivity to vol)
 * 4. Update: σₙ₊₁ = σₙ - [V(σₙ) - Market Price] / Vega
 * 5. Repeat until |V(σₙ) - Market Price| < tolerance
 *
 * Why it works:
 * - Vega tells us how sensitive the price is to volatility changes
 * - We adjust sigma based on the price difference
 * - Converges quadratically (very fast) for well-behaved functions
 *
 * Convergence:
 * - Usually 5-10 iterations for typical options
 * - Guaranteed to converge for short-dated ATM options
 * - May struggle for deep OTM or very long-dated options
 *
 * @param marketPrice - Observed market price of option
 * @param inputs - Black-Scholes inputs (without sigma)
 * @param config - Solver configuration
 * @returns IV solver result with implied volatility
 */
export function solveImpliedVolatility(
  marketPrice: number,
  inputs: Omit<BlackScholesInputs, 'sigma'>,
  config: Partial<IVSolverConfig> = {}
): IVSolverResult {
  const cfg = { ...DEFAULT_IV_CONFIG, ...config };

  // Validate market price
  if (marketPrice <= 0) {
    return {
      impliedVolatility: null,
      iterations: 0,
      converged: false,
      error: 'Market price must be positive',
      usedFallback: false,
    };
  }

  // Validate time to expiry
  if (inputs.T <= 0) {
    return {
      impliedVolatility: null,
      iterations: 0,
      converged: false,
      error: 'Time to expiry must be positive',
      usedFallback: false,
    };
  }

  // Validate against intrinsic value
  const intrinsicValue =
    inputs.optionType === 'call'
      ? Math.max(0, inputs.S - inputs.K)
      : Math.max(0, inputs.K - inputs.S);

  if (marketPrice < intrinsicValue * 0.99) {
    // Allow 1% tolerance for rounding
    return {
      impliedVolatility: null,
      iterations: 0,
      converged: false,
      error: 'Market price below intrinsic value (arbitrage opportunity or data error)',
      usedFallback: false,
    };
  }

  // Start Newton-Raphson iteration
  let sigma = cfg.initialGuess;
  let iterations = 0;

  for (let i = 0; i < cfg.maxIterations; i++) {
    iterations++;

    // Calculate theoretical price and vega at current sigma
    const fullInputs: BlackScholesInputs = { ...inputs, sigma };
    const theoreticalPrice = optionPrice(fullInputs);
    const vegaValue = vega(fullInputs);

    // Check for convergence: is price close enough to market price?
    const priceDiff = theoreticalPrice - marketPrice;
    if (Math.abs(priceDiff) < cfg.tolerance) {
      return {
        impliedVolatility: sigma,
        iterations,
        converged: true,
        error: null,
        usedFallback: false,
      };
    }

    // Avoid division by zero (vega → 0 at expiration or extreme vols)
    if (Math.abs(vegaValue) < 1e-10) {
      break; // Exit and use fallback
    }

    // Newton-Raphson update formula
    // σₙ₊₁ = σₙ - (V(σₙ) - Market Price) / Vega
    // Note: vega is per 1% volatility, so we multiply by 100
    sigma = sigma - priceDiff / (vegaValue * 100);

    // Enforce bounds to prevent unrealistic volatilities
    sigma = Math.max(cfg.minVolatility, Math.min(cfg.maxVolatility, sigma));
  }

  // Did not converge, but return last calculated value
  return {
    impliedVolatility: sigma,
    iterations,
    converged: false,
    error: `Did not converge after ${cfg.maxIterations} iterations`,
    usedFallback: false,
  };
}

/**
 * Calculate Historical Volatility from price history
 *
 * Method: Standard deviation of log returns, annualized
 *
 * Formula:
 * ────────
 * 1. Calculate log returns: rₜ = ln(Pₜ / Pₜ₋₁)
 * 2. Calculate standard deviation: σ_daily = stdev(rₜ)
 * 3. Annualize: σ_annual = σ_daily * √252
 *    (252 = number of trading days per year)
 *
 * Why log returns?
 * - Eliminate bias from price level (works for all price ranges)
 * - Mathematically sound for continuous compounding
 * - Better statistical properties than simple returns
 *
 * Annualization:
 * - Daily volatility moves scale with sqrt(time)
 * - 252 trading days ≈ 1 year
 * - √252 ≈ 15.87
 *
 * Example:
 * - Daily volatility = 1% → Annual = 1% × 15.87 = 15.87%
 * - Daily volatility = 2% → Annual = 2% × 15.87 = 31.74%
 *
 * @param prices - Array of closing prices (older to newer)
 * @param lookbackDays - Number of days to lookback (default: 30)
 * @returns Historical volatility (annualized), or null if insufficient data
 */
export function calculateHistoricalVolatility(
  prices: number[],
  lookbackDays: number = 30
): number | null {
  // Need at least 2 prices to calculate return
  if (prices.length < 2) {
    return null;
  }

  // Use last N prices (or all available if fewer)
  const relevantPrices = prices.slice(-Math.min(lookbackDays, prices.length));

  if (relevantPrices.length < 2) {
    return null;
  }

  // Calculate log returns
  const logReturns: number[] = [];
  for (let i = 1; i < relevantPrices.length; i++) {
    const prevPrice = relevantPrices[i - 1];
    const currPrice = relevantPrices[i];

    // Avoid division by zero
    if (prevPrice <= 0) {
      continue;
    }

    const logReturn = Math.log(currPrice / prevPrice);
    logReturns.push(logReturn);
  }

  // Need at least 1 return to calculate variance
  if (logReturns.length === 0) {
    return null;
  }

  // Calculate mean return
  const meanReturn =
    logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;

  // Calculate variance (variance = avg of squared deviations from mean)
  const variance =
    logReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
    logReturns.length;

  // Standard deviation (daily volatility)
  const dailyVolatility = Math.sqrt(variance);

  // Annualize volatility (trading days per year = 252)
  const annualVolatility = dailyVolatility * Math.sqrt(252);

  return annualVolatility;
}

/**
 * Solve for IV with automatic fallback to Historical Volatility
 *
 * Robustness Strategy:
 * ────────────────────
 * 1. Try Newton-Raphson with default initial guess (20%)
 *    → If converges: Success! Return IV
 *    → If fails: Continue to step 2
 *
 * 2. If we have historical price data:
 *    → Calculate 30-day historical volatility
 *    → Retry Newton-Raphson with HV as initial guess (better starting point)
 *    → If converges: Success! Return IV
 *    → If fails: Use HV as fallback (market-implied vol might not exist)
 *
 * 3. If no HV or second attempt also fails:
 *    → Use 20% default as final fallback
 *    → This ensures we never return null (always have some volatility)
 *
 * Why fallback to HV?
 * - IV solver might not converge for:
 *   → Deep OTM/ITM options (thin data, large errors)
 *   → Options at expiration (vega → 0)
 *   → Illiquid options (wide bid-ask, inaccurate price)
 * - Historical vol is always calculable and represents recent price moves
 * - Better to use HV than random guess
 *
 * @param marketPrice - Observed market price of option
 * @param inputs - Black-Scholes inputs (without sigma)
 * @param historicalPrices - Array of historical spot/option prices (optional)
 * @param config - Solver configuration
 * @returns IV solver result with either IV or fallback volatility
 */
export function solveImpliedVolatilityWithFallback(
  marketPrice: number,
  inputs: Omit<BlackScholesInputs, 'sigma'>,
  historicalPrices?: number[],
  config: Partial<IVSolverConfig> = {}
): IVSolverResult {
  // First attempt with default initial guess (20%)
  const firstAttempt = solveImpliedVolatility(marketPrice, inputs, config);

  // If converged, return immediately
  if (firstAttempt.converged) {
    return firstAttempt;
  }

  // Calculate historical volatility if data available
  let historicalVolatility: number | null = null;
  if (historicalPrices && historicalPrices.length >= 2) {
    historicalVolatility = calculateHistoricalVolatility(historicalPrices, 30);
  }

  // If we have HV, retry with HV as initial guess
  if (historicalVolatility !== null && historicalVolatility > 0) {
    const secondAttempt = solveImpliedVolatility(
      marketPrice,
      inputs,
      { ...config, initialGuess: historicalVolatility }
    );

    // If this converges, return it
    if (secondAttempt.converged) {
      return secondAttempt;
    }

    // Still didn't converge, use HV as fallback
    return {
      impliedVolatility: historicalVolatility,
      iterations: secondAttempt.iterations,
      converged: false,
      error: 'Newton-Raphson did not converge, using historical volatility as fallback',
      usedFallback: true,
      fallbackType: 'historical',
    };
  }

  // No HV available or invalid, use initial guess as final fallback
  return {
    impliedVolatility:
      config.initialGuess || DEFAULT_IV_CONFIG.initialGuess,
    iterations: firstAttempt.iterations,
    converged: false,
    error: 'Newton-Raphson did not converge and no HV available, using initial guess as fallback',
    usedFallback: true,
    fallbackType: 'initial',
  };
}
