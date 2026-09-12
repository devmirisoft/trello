// Shared between the browser and the API routes, so nothing server-only here.

export type TrelloConfig = {
  apiKey: string;
  token: string;
  boardId?: string;
  boardName?: string;
  listId?: string;
  listName?: string;
};

export function isConfigured(
  config: TrelloConfig | null
): config is TrelloConfig {
  return !!config?.apiKey && !!config?.token && !!config?.listId;
}
