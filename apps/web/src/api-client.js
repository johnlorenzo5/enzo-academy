export function createApi(auth, fetcher = (...args) => fetch(...args), { wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  return async function api(path, {method='GET',body} = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    const options = {method,headers,body:body === undefined ? undefined : JSON.stringify(body)};
    // Course updates confirm exact revision retries on the server. Other mutations are
    // not replayed: a lost response does not establish whether the write took effect.
    const courseSave = method === 'PUT' && /^\/admin\/courses\/[^/]+$/.test(path);
    const attempts = method === 'GET' || courseSave ? 4 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response, result, interrupted = false;
      try { response = await fetcher(`/api${path}`, options); }
      catch { interrupted = true; }
      if (response) {
        try { result = await response.json(); }
        catch { interrupted = true; }
        if (response.status === 502 || response.status === 504) interrupted = true;
      }
      if (interrupted) {
        if (attempt + 1 < attempts) { await wait([500,1000,2000][attempt]); continue; }
        const error = new Error(courseSave
          ? 'The connection was interrupted while saving. Your draft is kept. Click Save again to confirm the result. If this continues, check the API terminal.'
          : 'The connection to the API was interrupted or it returned an invalid response. Try again in a moment. If this continues, check that both servers are running with npm run dev.');
        // A transport failure is transient even if the development proxy used status 500.
        error.status = 503;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(result?.error || 'The request could not be completed.');
        error.status = response.status;
        throw error;
      }
      return result;
    }
  };
}
