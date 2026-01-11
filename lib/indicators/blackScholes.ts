/**
 * Black-Scholes Option Pricing Model
 *
 * Implements the Black-Scholes-Merton model for European options pricing
 * and calculation of the Greeks (option Greeks/sensitivities).
 *
 * The Greeks measure how option prices change with respect to various factors:
 * - Delta: Change with spot price
 * - Gamma: Acceleration of delta
 * - Theta: Time decay (per day)
 * - Vega: Volatility sensitivity (per 1%)
 * - Rho: Interest rate sensitivity (per 1%)
 *
 * References:
 * - Black, F., & Scholes, M. (1973). "The pricing of options and corporate liabilities"
 * - Hull, J. C. (2018). "Options, Futures, and Other Derivatives"
 */

import {
  normalCDF,
  normalPDF,
  calculateD1,
  calculateD2,
} from './normalDistribution';

/**
 * Input parameters for Black-Scholes calculations
 */
export interface BlackScholesInputs {
  S: number; // Spot price
  K: number; // Strike price
  T: number; // Time to expiry (years, e.g., 5/365 for 5 days)
  r: number; // Risk-free rate (decimal, e.g., 0.07 for 7%)
  sigma: number; // Implied volatility (decimal, e.g., 0.20 for 20%)
  optionType: 'call' | 'put';
}

/**
 * Output Greeks and pricing information
 */
export interface BlackScholesGreeks {
  price: number; // Theoretical option price
  delta: number; // ∂V/∂S
  gamma: number; // ∂²V/∂S²
  theta: number; // ∂V/∂T (per day)
  vega: number; // ∂V/∂σ (per 1% volatility change)
  rho: number; // ∂V/∂r (per 1% rate change)
}

/**
 * Black-Scholes Call Option Price
 *
 * Formula: C = S*Φ(d1) - K*e^(-rT)*Φ(d2)
 *
 * Where:
 * - Φ = Standard normal CDF
 * - d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
 * - d2 = d1 - σ√T
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Theoretical call option price
 */
export function callPrice(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma } = inputs;

  // Handle expiration (T = 0)
  if (T <= 0) {
    return Math.max(0, S - K);
  }

  const d1 = calculateD1(S, K, T, r, sigma);
  const d2 = calculateD2(d1, sigma, T);

  const discountFactor = Math.exp(-r * T);
  const price = S * normalCDF(d1) - K * discountFactor * normalCDF(d2);

  return Math.max(0, price); // Price cannot be negative
}

/**
 * Black-Scholes Put Option Price
 *
 * Formula: P = K*e^(-rT)*Φ(-d2) - S*Φ(-d1)
 *
 * This is derived from put-call parity:
 * C - P = S - K*e^(-rT)
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Theoretical put option price
 */
export function putPrice(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma } = inputs;

  // Handle expiration (T = 0)
  if (T <= 0) {
    return Math.max(0, K - S);
  }

  const d1 = calculateD1(S, K, T, r, sigma);
  const d2 = calculateD2(d1, sigma, T);

  const discountFactor = Math.exp(-r * T);
  const price =
    K * discountFactor * normalCDF(-d2) - S * normalCDF(-d1);

  return Math.max(0, price); // Price cannot be negative
}

/**
 * Calculate option price (call or put)
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Theoretical option price
 */
export function optionPrice(inputs: BlackScholesInputs): number {
  return inputs.optionType === 'call' ? callPrice(inputs) : putPrice(inputs);
}

/**
 * Delta: Rate of change of option price with respect to spot price
 *
 * Delta measures how much the option price changes for a ₹1 change in spot price.
 *
 * Call Delta: Φ(d1)
 * Put Delta: Φ(d1) - 1 = -Φ(-d1)
 *
 * Range: [0, 1] for calls, [-1, 0] for puts
 *
 * Interpretation:
 * - Call delta ≈ 0.5 at ATM (50% probability of expiring ITM)
 * - Call delta → 1.0 as S >> K (deep ITM)
 * - Call delta → 0 as S << K (deep OTM)
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Delta value
 */
export function delta(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma, optionType } = inputs;

  // Handle expiration
  if (T <= 0) {
    if (optionType === 'call') {
      return S > K ? 1.0 : S < K ? 0.0 : 0.5;
    } else {
      return S < K ? -1.0 : S > K ? 0.0 : -0.5;
    }
  }

  const d1 = calculateD1(S, K, T, r, sigma);

  if (optionType === 'call') {
    return normalCDF(d1);
  } else {
    return normalCDF(d1) - 1.0;
  }
}

/**
 * Gamma: Rate of change of delta with respect to spot price
 *
 * Gamma measures how fast delta changes as spot price moves.
 * High gamma = risky for option sellers (delta changes quickly)
 * Low gamma = safe for option sellers (delta is stable)
 *
 * Formula: Γ = φ(d1) / (S * σ * √T)
 *
 * Range: [0, ∞) for both calls and puts
 *
 * Interpretation:
 * - Gamma is highest at ATM (where delta is most sensitive)
 * - Gamma increases as expiry approaches (time decay)
 * - Gamma is lowest deep OTM/ITM
 * - For sellers: Watch gamma explosion near expiry!
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Gamma value
 */
export function gamma(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma } = inputs;

  // Handle expiration
  if (T <= 0) {
    return 0;
  }

  const d1 = calculateD1(S, K, T, r, sigma);

  const numerator = normalPDF(d1);
  const denominator = S * sigma * Math.sqrt(T);

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

/**
 * Theta: Rate of change of option price with respect to time
 *
 * Theta measures how much option price decays per day.
 * Positive theta = seller profit (option loses value each day)
 * Negative theta = buyer profit (option gains value)
 *
 * For short strangles/straddles, we want positive theta!
 *
 * Call Theta:
 *   Θ_call = -(S*φ(d1)*σ)/(2√T) - r*K*e^(-rT)*Φ(d2)
 *
 * Put Theta:
 *   Θ_put = -(S*φ(d1)*σ)/(2√T) + r*K*e^(-rT)*Φ(-d2)
 *
 * Returned per DAY (divide annual by 365)
 *
 * Range: (-∞, 0) for most cases
 * Exception: Deep ITM calls with high interest rates can have positive theta
 *
 * Interpretation:
 * - Theta is zero at-the-money
 * - Theta becomes very negative near expiry (gamma acceleration)
 * - For sellers: Theta is your enemy (option decays faster as expiry approaches)
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Theta value (per day)
 */
export function theta(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma, optionType } = inputs;

  // Handle expiration
  if (T <= 0) {
    return 0;
  }

  const d1 = calculateD1(S, K, T, r, sigma);
  const d2 = calculateD2(d1, sigma, T);

  // Decay component (same for both calls and puts)
  const decayTerm = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));

  // Interest rate component (different for calls and puts)
  const discountFactor = Math.exp(-r * T);

  let thetaAnnual: number;

  if (optionType === 'call') {
    const rateTerm = -r * K * discountFactor * normalCDF(d2);
    thetaAnnual = decayTerm + rateTerm;
  } else {
    const rateTerm = r * K * discountFactor * normalCDF(-d2);
    thetaAnnual = decayTerm + rateTerm;
  }

  // Convert from per-year to per-day
  const thetaDaily = thetaAnnual / 365.0;

  return thetaDaily;
}

/**
 * Vega: Rate of change of option price with respect to volatility
 *
 * Vega measures how much option price changes for a 1% change in volatility.
 *
 * High vega = sensitive to volatility changes (riskier for sellers during vol spikes)
 * Low vega = insensitive to volatility changes (safer for sellers)
 *
 * Formula: ν = S * φ(d1) * √T
 *
 * Returned per 1% volatility change (divide by 100)
 *
 * Range: [0, ∞) for both calls and puts
 *
 * Interpretation:
 * - Vega is highest ATM and for longer dated options
 * - Vega increases when volatility is low (more room to move)
 * - For sellers: High vega = high risk if IV spikes
 * - Vega is always positive (both calls and puts benefit from higher vol)
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Vega value (per 1% volatility change)
 */
export function vega(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma } = inputs;

  // Handle expiration
  if (T <= 0) {
    return 0;
  }

  const d1 = calculateD1(S, K, T, r, sigma);

  const vegaValue = S * normalPDF(d1) * Math.sqrt(T);

  // Return per 1% volatility change (divide by 100)
  return vegaValue / 100.0;
}

/**
 * Rho: Rate of change of option price with respect to interest rate
 *
 * Rho measures how much option price changes for a 1% change in interest rate.
 *
 * For index options like NIFTY, rho is usually small because:
 * - We're trading options on indices, not bonds
 * - Interest rates are relatively stable
 * - Impact is minimal for short-dated options
 *
 * Call Rho: K * T * e^(-rT) * Φ(d2)
 * Put Rho: -K * T * e^(-rT) * Φ(-d2)
 *
 * Returned per 1% interest rate change (divide by 100)
 *
 * Range: [0, ∞) for calls, (-∞, 0] for puts
 *
 * Interpretation:
 * - Rho is usually ignored for short-term options
 * - More important for long-dated options (> 1 year)
 * - For index options, rho is typically < 1% of position value
 *
 * @param inputs - Black-Scholes input parameters
 * @returns Rho value (per 1% interest rate change)
 */
export function rho(inputs: BlackScholesInputs): number {
  const { S, K, T, r, sigma, optionType } = inputs;

  // Handle expiration
  if (T <= 0) {
    return 0;
  }

  const d1 = calculateD1(S, K, T, r, sigma);
  const d2 = calculateD2(d1, sigma, T);

  const discountFactor = Math.exp(-r * T);

  let rhoValue: number;

  if (optionType === 'call') {
    rhoValue = K * T * discountFactor * normalCDF(d2);
  } else {
    rhoValue = -K * T * discountFactor * normalCDF(-d2);
  }

  // Return per 1% rate change
  return rhoValue / 100.0;
}

/**
 * Calculate all Greeks at once
 *
 * More efficient than calling individual greek functions separately
 * because d1 and d2 are calculated only once.
 *
 * @param inputs - Black-Scholes input parameters
 * @returns All Greeks and pricing information
 */
export function calculateAllGreeks(
  inputs: BlackScholesInputs
): BlackScholesGreeks {
  const { S, K, T, r, sigma, optionType } = inputs;

  // Handle expiration
  if (T <= 0) {
    const intrinsicValue =
      optionType === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    return {
      price: intrinsicValue,
      delta: optionType === 'call' ? (S > K ? 1 : S < K ? 0 : 0.5) : S < K ? -1 : S > K ? 0 : -0.5,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  // Calculate d1 and d2 once
  const d1 = calculateD1(S, K, T, r, sigma);
  const d2 = calculateD2(d1, sigma, T);

  // Calculate price
  const discountFactor = Math.exp(-r * T);
  let price: number;
  if (optionType === 'call') {
    price = S * normalCDF(d1) - K * discountFactor * normalCDF(d2);
  } else {
    price = K * discountFactor * normalCDF(-d2) - S * normalCDF(-d1);
  }
  price = Math.max(0, price);

  // Calculate delta
  let deltaValue: number;
  if (optionType === 'call') {
    deltaValue = normalCDF(d1);
  } else {
    deltaValue = normalCDF(d1) - 1.0;
  }

  // Calculate gamma (same for both calls and puts)
  const gammaValue = normalPDF(d1) / (S * sigma * Math.sqrt(T));

  // Calculate theta
  const decayTerm = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
  let thetaValue: number;
  if (optionType === 'call') {
    thetaValue =
      decayTerm - r * K * discountFactor * normalCDF(d2);
  } else {
    thetaValue =
      decayTerm + r * K * discountFactor * normalCDF(-d2);
  }
  thetaValue = thetaValue / 365.0; // Per day

  // Calculate vega (same for both calls and puts)
  const vegaValue = (S * normalPDF(d1) * Math.sqrt(T)) / 100.0;

  // Calculate rho
  let rhoValue: number;
  if (optionType === 'call') {
    rhoValue = K * T * discountFactor * normalCDF(d2);
  } else {
    rhoValue = -K * T * discountFactor * normalCDF(-d2);
  }
  rhoValue = rhoValue / 100.0;

  return {
    price,
    delta: deltaValue,
    gamma: gammaValue,
    theta: thetaValue,
    vega: vegaValue,
    rho: rhoValue,
  };
}
