export const createOfflineRequestError = () => {
  const error = new Error('This request is unavailable while Bookshelf is offline.');
  error.code = 'ERR_OFFLINE';
  error.isOffline = true;
  return error;
};

export const guardOnlineRequest = (config, browserNavigator = globalThis.navigator) => {
  if (browserNavigator?.onLine === false) throw createOfflineRequestError();
  return config;
};
