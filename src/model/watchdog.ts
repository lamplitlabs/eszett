// A stall timer that can tell a hung model from a suspended process. Android freezes an app that has been in the
// background for a while (Samsung after about a minute); when the learner comes back, every pending timer fires at
// once although the model never had a chance to answer in between.

/** A watchdog firing this long past its due time ran while the process was suspended, not while the model hung. */
export const SUSPEND_SLACK_MS = 5_000;

/** Calls onStall once nothing has reset the timer for ms; a timer that fires late re-arms for the full window instead. Returns the cancel function. */
export function watchdog(ms: number, onStall: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const due = Date.now() + ms;
    timer = setTimeout(() => (Date.now() - due > SUSPEND_SLACK_MS ? arm() : onStall()), ms);
  };
  arm();
  return () => clearTimeout(timer);
}
