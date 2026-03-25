/**
 * Environment variable management for Cloudflare Pages
 * Provides type-safe access to environment variables and Cloudflare bindings
 */

/**
 * Get environment variable or return undefined
 * @param key - Environment variable key
 * @returns Environment variable value or undefined
 */
export function getEnv(key: string): string | undefined {
  if (typeof window !== 'undefined') {
    // Client-side: environment variables must be prefixed with NEXT_PUBLIC_
    return (globalThis as any)[`NEXT_PUBLIC_${key}`];
  }
  
  // Server-side: access process.env
  return process.env[key];
}

/**
 * Get environment variable or throw error if missing
 * @param key - Environment variable key
 * @returns Environment variable value
 * @throws Error if environment variable is not set
 */
export function getEnvRequired(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get Cloudflare Pages context
 * Available in server-side routes only
 */
export function getCloudflarePagesContext() {
  if (typeof window !== 'undefined') {
    throw new Error('Cloudflare Pages context is only available on the server');
  }
  
  // Return the context object that Cloudflare Pages provides
  return (globalThis as any).__cf_pages_context;
}

/**
 * Type for Cloudflare environment variables
 * Extend this interface with your custom environment variables
 */
export interface CloudflareEnv {
  // Add your environment variables here
  // Example: API_KEY?: string;
  // Example: DATABASE_URL?: string;
}
