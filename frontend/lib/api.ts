/**
 * API utilities para comunicacao com o backend
 * Better Auth handles authentication via cookies, so no manual token management needed
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"

/**
 * Interface para resposta padrao da API
 */
export interface ApiResponse<T = unknown> {
  sucesso: boolean
  mensagem?: string
  codigo?: string
  data?: T
  needsOnboarding?: boolean
  [key: string]: unknown
}

/**
 * Erro customizado da API
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/**
 * Fetch autenticado usando cookies (Better Auth)
 * No need for manual token handling - cookies are sent automatically
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include", // Important: include cookies for auth
  })

  return response
}

/**
 * Wrapper tipado para chamadas GET
 */
export async function apiGet<T>(endpoint: string): Promise<ApiResponse<T>> {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`)
  return response.json()
}

/**
 * Wrapper tipado para chamadas POST
 */
export async function apiPost<T>(
  endpoint: string,
  body: unknown
): Promise<ApiResponse<T>> {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  return response.json()
}

/**
 * Wrapper tipado para chamadas PUT
 */
export async function apiPut<T>(
  endpoint: string,
  body: unknown
): Promise<ApiResponse<T>> {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
  return response.json()
}

/**
 * Wrapper tipado para chamadas DELETE
 */
export async function apiDelete<T>(endpoint: string): Promise<ApiResponse<T>> {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: "DELETE",
  })
  return response.json()
}

/**
 * Wrapper tipado para chamadas PATCH
 */
export async function apiPatch<T>(
  endpoint: string,
  body: unknown
): Promise<ApiResponse<T>> {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  return response.json()
}

// Legacy exports for backwards compatibility (deprecated)
/** @deprecated Better Auth uses cookies, no manual token storage needed */
export const TokenStorage = {
  getToken: () => null,
  setToken: (_token: string) => {},
  getRefreshToken: () => null,
  setRefreshToken: (_token: string) => {},
  clearTokens: () => {},
}

/** @deprecated Better Auth handles token refresh automatically */
export async function refreshAccessToken(): Promise<string | null> {
  return null
}
