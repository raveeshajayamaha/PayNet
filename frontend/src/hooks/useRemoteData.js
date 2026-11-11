import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
export function useRemoteData(path, enabled = true, revision = 0) {
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([path, revision, retry]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiRequest(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ key, data, error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: error.message });
    });
    return () => controller.abort();
  }, [path, enabled, key]);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : '', loading: enabled && state.key !== key, retry: () => setRetry((n) => n + 1) };
}
