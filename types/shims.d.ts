// Minimal shims for third-party modules to reduce TypeScript noise while
// we iterate on server-side type issues. These declare the modules as
// `any` so the compiler stops complaining about their shapes.

declare module 'ioredis' {
  // CommonJS style export: module.exports = Redis
  interface RedisConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const Redis: RedisConstructor;
  export = Redis;
}

declare module 'ioredis/built/index' {
  interface RedisConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const Redis: RedisConstructor;
  export = Redis;
}

declare module 'socks-proxy-agent' {
  interface AgentConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const Agent: AgentConstructor;
  export = Agent;
}

declare module 'http-proxy-agent' {
  interface AgentConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const Agent: AgentConstructor;
  export = Agent;
}

declare module 'express-rate-limit' {
  // export = rateLimit (callable)
  function rateLimit(...args: any[]): any;
  namespace rateLimit {}
  export = rateLimit;
}

declare module 'robots-parser' {
  // robots-parser exposes a parse function in some versions
  interface RobotsParserModule {
    parse?: (...args: any[]) => any;
    default?: any;
    [key: string]: any;
  }
  const robots: RobotsParserModule;
  export = robots;
}

declare module '@anthropic-ai/sdk' {
  interface AnthropicConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const Anthropic: AnthropicConstructor;
  export = Anthropic;
}

declare module '@supabase/ssr' {
  const supabaseSSR: any;
  export default supabaseSSR;
}

declare module '@supabase/supabase-js' {
  const supabaseJS: any;
  export default supabaseJS;
}

// Match relative imports that end with core/supabase (e.g. ../core/supabase)
declare module '*core/supabase' {
  export const supabase: any;
}

declare module 'node-cache' {
  interface NodeCacheConstructor {
    new (...args: any[]): any;
    (...args: any[]): any;
    prototype: any;
  }
  const NodeCache: NodeCacheConstructor;
  export = NodeCache;
}

declare module 'helmet' {
  function helmet(...args: any[]): any;
  namespace helmet {}
  export = helmet;
}

declare module 'socks-proxy-agent/dist/index' {
  const Agent: any;
  export = Agent;
}

declare module 'http-proxy-agent/dist/index' {
  const Agent: any;
  export = Agent;
}

declare module 'node-fetch' {
  const fetch: any;
  export default fetch;
}

declare module 'uuid' {
  export const v4: any;
  export const v1: any;
  const uuid: any;
  export default uuid;
}

declare module 'jsonwebtoken' {
  export function sign(...args: any[]): any;
  export function verify(...args: any[]): any;
  export function decode(...args: any[]): any;
  const jwt: any;
  export default jwt;
}

// Minimal alias to quiet Express/qs related ParsedQs references in JS files
type ParsedQs = any;

declare module 'undici' {
  const undici: any;
  export = undici;
}

// Generic fallback to silence any other poorly-typed packages referenced in the codebase
declare module '*-agent' {
  const m: any;
  export = m;
}

// Small global augmentation to quiet Playwright/DOM hacks used in scrapers
declare global {
  interface Window {
    chrome?: any;
  }
  var chrome: any;
}

// Local project shims for internal modules that are required but have no
// type definitions yet. These are intentionally permissive (any)
declare module '../core/scraping-engine' {
  const mod: any;
  export = mod;
}

declare module '../ai/visual-trainer' {
  const mod: any;
  export = mod;
}

declare module '../services/data-exporter' {
  const mod: any;
  export = mod;
}

// Minimal AIService augmentation so callClaude is accepted during type checking
declare module '*/ai-service' {
  const AIService: any;
  export = AIService;
}

// Wildcard shims for local internal modules referenced by some service files
declare module '../core/*' {
  const anyMod: any;
  export = anyMod;
}

declare module '../ai/*' {
  const anyMod: any;
  export = anyMod;
}

declare module '../services/*' {
  const anyMod: any;
  export = anyMod;
}
