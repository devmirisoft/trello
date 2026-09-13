// Shared between the browser and the API routes, so nothing server-only here.

export type TrelloConfig = {
  apiKey: string;
  token: string;
  boardId?: string;
  boardName?: string;
  listId?: string;
  listName?: string;
  /** The board member every card in a batch gets assigned to. */
  memberId?: string;
  memberName?: string;
  memberInitials?: string;
  memberAvatarUrl?: string | null;
};

/** Gates the camera: a config is only usable once there is a list to create
 * cards in and a person to assign them to. */
export function isConfigured(
  config: TrelloConfig | null
): config is TrelloConfig {
  return (
    !!config?.apiKey && !!config?.token && !!config?.listId && !!config?.memberId
  );
}
