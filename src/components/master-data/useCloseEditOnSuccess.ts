import { useState } from "react";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";

// React's "adjust state during render" pattern (not useEffect — the
// react-hooks lint rule flags setState-in-effect as an extra render pass).
// Closes an inline edit form back to view mode the same render a mutation
// succeeds, instead of leaving stale data on screen after a save.
export function useCloseEditOnSuccess(
  state: MasterDataActionResult,
  initialState: MasterDataActionResult,
  setEditing: (value: boolean) => void,
) {
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state !== initialState && !state.error && !state.fieldErrors) {
      setEditing(false);
    }
  }
}
