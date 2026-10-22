/** Invalidates an asynchronous AI result when its source or destination was edited. */
export function createGenerationGate() {
  let generation=0;
  let revision=0;
  let pending=null;
  return {
    begin() {
      if(pending) pending.abort();
      pending=new AbortController();
      return {generation:++generation,revision,signal:pending.signal};
    },
    invalidate() {
      ++revision;
      if(pending) pending.abort();
      pending=null;
      ++generation;
    },
    isCurrent(job) {
      return job.generation===generation && job.revision===revision && !job.signal.aborted;
    },
    finish(job) {
      if(!this.isCurrent(job)) return false;
      pending=null;
      return true;
    }
  };
}
