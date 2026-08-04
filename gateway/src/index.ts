interface Env {
  FRONTEND_ORIGIN: string
  API_ORIGIN: string
}

function targetOrigin(requestUrl: URL, env: Env): URL {
  const isApiRequest = requestUrl.pathname === '/api'
    || requestUrl.pathname.startsWith('/api/')
  return new URL(isApiRequest ? env.API_ORIGIN : env.FRONTEND_ORIGIN)
}

function rewriteLocation(
  location: string,
  upstreamUrl: URL,
  upstreamOrigin: string,
  publicOrigin: string,
): string {
  const redirectUrl = new URL(location, upstreamUrl)
  if (redirectUrl.origin !== upstreamOrigin) return location
  return `${publicOrigin}${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url)
    const upstreamOrigin = targetOrigin(requestUrl, env)
    const upstreamUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      upstreamOrigin,
    )
    const isApiRequest = upstreamOrigin.origin === new URL(env.API_ORIGIN).origin
    const headers = new Headers(request.headers)
    headers.delete('host')

    if (!isApiRequest) {
      headers.delete('authorization')
      headers.delete('cookie')
    }

    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
      redirect: 'manual',
    })
    const upstreamResponse = await fetch(upstreamRequest)
    const responseHeaders = new Headers(upstreamResponse.headers)

    if (!isApiRequest) {
      responseHeaders.delete('set-cookie')
    }

    const location = responseHeaders.get('location')
    if (location) {
      responseHeaders.set(
        'location',
        rewriteLocation(
          location,
          upstreamUrl,
          upstreamOrigin.origin,
          requestUrl.origin,
        ),
      )
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  },
}
