import { useCallback, useEffect, useRef, useState } from "react";
import * as Api from "../util/fetch";

const empty: Api.WorkspacePreferences = { revision: 0, pinned: [], recent: [], searches: [] };
export function useWorkspacePreferences(userId?: string) {
  const account = useRef(userId);
  const [state, setState] = useState({ accountId: userId, data: empty });
  const [error, setError] = useState("");
  useEffect(() => {
    account.current = userId;
    let active = true;
    setError("");
    if (userId) Api.fetchWorkspacePreferences().then(data => { if (active) setState(previous => previous.accountId === userId && previous.data.revision > data.revision ? previous : { accountId: userId, data }); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load workspace preferences."); });
    return () => { active = false; };
  }, [userId]);
  const update = useCallback(async (action: Api.WorkspaceAction) => {
    if (!userId) return;
    try {
      const data = await Api.updateWorkspacePreferences(action);
      if (account.current === userId) { setState(previous => previous.accountId === userId && previous.data.revision > data.revision ? previous : { accountId: userId, data }); setError(""); }
    } catch (error) { if (account.current === userId) setError(error instanceof Error ? error.message : "Could not save workspace preferences."); }
  }, [userId]);
  const recordOpen = useCallback((noteId: string) => { void update({ action: "open", noteId }); }, [update]);
  return { data: state.accountId === userId ? state.data : empty, error, update, recordOpen };
}
