/**
 * Options Greeks Calculation Interface
 *
 * High-level API for calculating accurate option Greeks.
 * Handles:
 * - Implied Volatility solving (Newton-Raphson with fallback)
 * - Black-Scholes Greeks calculation
 * - Combined Greeks for straddles and strangles
 * - Risk assessment for option sellers
 *
 * This is the primary interface that chart pages should use.
 */

import { calculateAllGreeks, type BlackScholesInputs } from './blackScholes';
import {
  solveImpliedVolatilityWithFallback,
  calculateHistoricalVolatility,
} from './impliedVolatility';

/**
 * Input parameters for calculating option Greeks
 */
export interface OptionsGreeksInput {
  // Market data - REQUIRED
  spotPrice: number; // Current spot/index price
  strikePrice: number; // Option strike price
  marketPrice: number; // Current option premium (CE or PE)
  optionType: 'call' | 'put';
  daysToExpiry: number; // Days until option expiration

  // Historical data - OPTIONAL (for HV fallback)
  historicalSpotPrices?: number[]; // Array of historical spot prices

  // Configuration - OPTIONAL
  riskFreeRate?: number; // Risk-free rate, default 0.07 (7% for India)
  useImpliedVolatility?: boolean; // Default true - use IV solver
}

/**
 * Complete Greeks and volatility information
 */
export interface OptionsGreeksResult {
  // The 5 Greeks
  delta: number; // Directional sensitivity (±0.5 for ATM)
  gamma: number; // Delta acceleration (positive, higher near expiry)
  theta: number; // Time decay per day (negative for buyers, positive for sellers)
  vega: number; // Volatility sensitivity per 1% change
  rho: number; // Interest rate sensitivity per 1% change

  // Volatility Information
  impliedVolatility: number | null; // Market-implied volatility (may be null if solver fails)
  historicalVolatility: number | null; // 30-day historical volatility (may be null if insufficient data)
  volatilityUsed: number; // The volatility actually used in Black-Scholes (IV or HV or default)
  ivConverged: boolean; // Did Newton-Raphson converge?
  ivUsedFallback: boolean; // Did we use a fallback volatility?

  // Pricing Information
  theoreticalPrice: number; // Black-Scholes theoretical price
  marketPrice: number; // Market price (input)
  priceDifference: number; // Market Price - Theoretical Price

  // Risk Assessment for Sellers
  riskLevel: 'safe' | 'caution' | 'danger';
}

/**
 * Calculate Greeks for a single option (CE or PE)
 *
 * Process:
 * ────────
 * 1. Attempt to solve for Implied Volatility using market price
 *    - Uses Newton-Raphson method
 *    - Falls back to Historical Volatility if NR doesn't converge
 *    - Falls back to 20% default if no historical data
 *
 * 2. Calculate all Greeks using Black-Scholes with solved IV (or fallback)
 *
 * 3. Assess risk level for option sellers:
 *    - "danger": DTE ≤ 7 days or Gamma > 0.008
 *    - "caution": DTE 8-14 days OR Gamma 0.005-0.008 OR low Theta/Vega
 *    - "safe": DTE > 14 days with good Greeks
 *
 * @param input - Options Greeks input parameters
 * @returns Complete Greeks and metadata
 *
 * @example
 * ```typescript
 * const greeks = calculateOptionsGreeks({
 *   spotPrice: 26100,
 *   strikePrice: 26100,
 *   marketPrice: 150,
 *   optionType: 'call',
 *   daysToExpiry: 5,
 *   riskFreeRate: 0.07,
 * });
 *
 * console.log(`Delta: ${greeks.delta.toFixed(2)}`);      // How much price moves per ₹1 spot move
 * console.log(`Theta: ${greeks.theta.toFixed(2)}/day`);  // Time decay per day
 * console.log(`Risk: ${greeks.riskLevel}`);               // safe/caution/danger
 * ```
 */
export function calculateOptionsGreeks(
  input: OptionsGreeksInput
): OptionsGreeksResult {
  const {
    spotPrice,
    strikePrice,
    marketPrice,
    optionType,
    daysToExpiry,
    historicalSpotPrices,
    riskFreeRate = 0.07,
    useImpliedVolatility = true,
  } = input;

  // Convert days to years (required for Black-Scholes)
  const T = daysToExpiry / 365.0;

  // Calculate Historical Volatility if data available
  let historicalVolatility: number | null = null;
  if (historicalSpotPrices && historicalSpotPrices.length >= 2) {
    historicalVolatility = calculateHistoricalVolatility(
      historicalSpotPrices,
      30 // 30-day lookback
    );
  }

  // Solve for Implied Volatility
  let impliedVolatility: number | null = null;
  let ivConverged = false;
  let ivUsedFallback = false;
  let volatilityUsed = 0.2; // Default 20% fallback

  if (useImpliedVolatility) {
    const ivResult = solveImpliedVolatilityWithFallback(
      marketPrice,
      { S: spotPrice, K: strikePrice, T, r: riskFreeRate, optionType },
      historicalSpotPrices
    );

    impliedVolatility = ivResult.impliedVolatility;
    ivConverged = ivResult.converged;
    ivUsedFallback = ivResult.usedFallback;
    volatilityUsed = impliedVolatility || historicalVolatility || 0.2;
  } else {
    // Use historical volatility directly if IV solving is disabled
    volatilityUsed = historicalVolatility || 0.2;
  }

  // Calculate Greeks using Black-Scholes
  const bsInputs: BlackScholesInputs = {
    S: spotPrice,
    K: strikePrice,
    T,
    r: riskFreeRate,
    sigma: volatilityUsed,
    optionType,
  };

  const greeks = calculateAllGreeks(bsInputs);

  // Assess risk level for sellers
  // Risk increases when:
  // 1. Days to expiry decreases (gamma explosion risk)
  // 2. Gamma increases (delta becomes unstable)
  // 3. Theta decreases (less time decay to compensate for moves)
  // 4. Vega increases (more sensitive to vol changes)

  let riskLevel: 'safe' | 'caution' | 'danger' = 'safe';

  // Danger zone conditions
  if (daysToExpiry <= 7) {
    riskLevel = 'danger'; // Expiry approaching, gamma spike risk
  } else if (
    daysToExpiry <= 14 ||
    greeks.gamma > 0.008 ||
    greeks.theta > -0.5
  ) {
    // Caution zone conditions
    riskLevel = 'caution';
  } else if (
    daysToExpiry <= 20 &&
    (greeks.theta < 0.3 || Math.abs(greeks.vega) < 0.3)
  ) {
    // Still caution if Greeks are weak
    riskLevel = 'caution';
  }

  return {
    // Greeks
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    rho: greeks.rho,

    // Volatility Info
    impliedVolatility,
    historicalVolatility,
    volatilityUsed,
    ivConverged,
    ivUsedFallback,

    // Pricing
    theoreticalPrice: greeks.price,
    marketPrice,
    priceDifference: marketPrice - greeks.price,

    // Risk Assessment
    riskLevel,
  };
}

/**
 * Calculate combined Greeks for a Straddle
 *
 * A straddle is:
 * - Buy/Sell both CE and PE at the SAME strike price
 * - Used for neutral outlook or direction-agnostic trading
 *
 * Combined Greeks:
 * - Delta: CE Delta + PE Delta ≈ 0 (neutral for ATM straddle)
 * - Gamma: CE Gamma + PE Gamma (both positive, additive)
 * - Theta: CE Theta + PE Theta (both positive for sellers, additive)
 * - Vega: CE Vega + PE Vega (both positive, additive)
 * - Rho: CE Rho + PE Rho (opposite signs, usually cancel)
 *
 * @param ceInput - CE option input
 * @param peInput - PE option input
 * @returns Object with combined Greeks and individual CE/PE Greeks
 *
 * @example
 * ```typescript
 * const { combined, ce, pe } = calculateStraddleGreeks(
 *   {
 *     spotPrice: 26100,
 *     strikePrice: 26100,
 *     marketPrice: 200, // CE price
 *     optionType: 'call',
 *     daysToExpiry: 5,
 *   },
 *   {
 *     spotPrice: 26100,
 *     strikePrice: 26100,
 *     marketPrice: 150, // PE price
 *     optionType: 'put',
 *     daysToExpiry: 5,
 *   }
 * );
 *
 * console.log(`Combined Theta: ${combined.theta.toFixed(2)}/day`);
 * console.log(`CE contributes: ${ce.theta.toFixed(2)}/day`);
 * console.log(`PE contributes: ${pe.theta.toFixed(2)}/day`);
 * ```
 */
export function calculateStraddleGreeks(
  ceInput: OptionsGreeksInput,
  peInput: OptionsGreeksInput
): {
  combined: OptionsGreeksResult;
  ce: OptionsGreeksResult;
  pe: OptionsGreeksResult;
} {
  // Calculate Greeks for CE and PE separately
  const ceGreeks = calculateOptionsGreeks({ ...ceInput, optionType: 'call' });
  const peGreeks = calculateOptionsGreeks({ ...peInput, optionType: 'put' });

  // Combine Greeks (additive properties)
  const combined: OptionsGreeksResult = {
    // Greeks are additive
    delta: ceGreeks.delta + peGreeks.delta,
    gamma: ceGreeks.gamma + peGreeks.gamma,
    theta: ceGreeks.theta + peGreeks.theta,
    vega: ceGreeks.vega + peGreeks.vega,
    rho: ceGreeks.rho + peGreeks.rho,

    // Average volatility metrics
    impliedVolatility:
      ceGreeks.impliedVolatility && peGreeks.impliedVolatility
        ? (ceGreeks.impliedVolatility + peGreeks.impliedVolatility) / 2
        : null,
    historicalVolatility: ceGreeks.historicalVolatility,
    volatilityUsed:
      (ceGreeks.volatilityUsed + peGreeks.volatilityUsed) / 2,
    ivConverged: ceGreeks.ivConverged && peGreeks.ivConverged,
    ivUsedFallback: ceGreeks.ivUsedFallback || peGreeks.ivUsedFallback,

    // Combined pricing
    theoreticalPrice: ceGreeks.theoreticalPrice + peGreeks.theoreticalPrice,
    marketPrice: ceGreeks.marketPrice + peGreeks.marketPrice,
    priceDifference:
      ceGreeks.priceDifference + peGreeks.priceDifference,

    // Risk is worst of both legs
    riskLevel:
      ceGreeks.riskLevel === 'danger' || peGreeks.riskLevel === 'danger'
        ? 'danger'
        : ceGreeks.riskLevel === 'caution' || peGreeks.riskLevel === 'caution'
          ? 'caution'
          : 'safe',
  };

  return { combined, ce: ceGreeks, pe: peGreeks };
}

/**
 * Calculate combined Greeks for a Strangle
 *
 * A strangle is:
 * - Buy/Sell both CE and PE at DIFFERENT strike prices
 * - Used when expecting smaller moves than a straddle
 * - Cheaper than straddle (OTM premiums are lower)
 *
 * Combined Greeks:
 * - Delta: CE Delta + PE Delta (usually close to 0 for balanced strangle)
 * - Gamma: CE Gamma + PE Gamma (lower than straddle, safer)
 * - Theta: CE Theta + PE Theta (lower than straddle)
 * - Vega: CE Vega + PE Vega (lower than straddle)
 * - Rho: CE Rho + PE Rho
 *
 * Difference from Straddle:
 * - Strangle: Lower cost, lower profit range, lower risk
 * - Straddle: Higher cost, bigger profit range, higher risk
 *
 * @param ceInput - CE option input (higher strike)
 * @param peInput - PE option input (lower strike)
 * @returns Object with combined Greeks and individual CE/PE Greeks
 *
 * @example
 * ```typescript
 * const { combined, ce, pe } = calculateStrangleGreeks(
 *   {
 *     spotPrice: 26100,
 *     strikePrice: 26200, // CE strike (higher)
 *     marketPrice: 150,
 *     optionType: 'call',
 *     daysToExpiry: 5,
 *   },
 *   {
 *     spotPrice: 26100,
 *     strikePrice: 26000, // PE strike (lower)
 *     marketPrice: 100,
 *     optionType: 'put',
 *     daysToExpiry: 5,
 *   }
 * );
 *
 * console.log(`Strangle Premium: ${ce.marketPrice + pe.marketPrice}`);
 * console.log(`Combined Gamma: ${combined.gamma.toFixed(4)}`);
 * ```
 */
export function calculateStrangleGreeks(
  ceInput: OptionsGreeksInput,
  peInput: OptionsGreeksInput
): {
  combined: OptionsGreeksResult;
  ce: OptionsGreeksResult;
  pe: OptionsGreeksResult;
} {
  // Strangle logic is identical to straddle
  // The only difference is the strike prices (which are in the inputs)
  return calculateStraddleGreeks(ceInput, peInput);
}
