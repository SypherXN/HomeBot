/** localStorage keys shared by AuthContext and api layer (silent refresh). */
export const AUTH_STORAGE_TOKEN = "homebot_webui_api_token";
export const AUTH_STORAGE_ACTOR = "homebot_webui_actor_user_id";
export const AUTH_STORAGE_WEB_USERNAME = "homebot_webui_web_username";
export const AUTH_STORAGE_REFRESH = "homebot_webui_refresh_token";

export const AUTH_ACCESS_REFRESHED_EVENT = "homebot-auth-access-refreshed";

export type AuthAccessRefreshedDetail = {
  accessToken: string;
  refreshToken: string;
};
