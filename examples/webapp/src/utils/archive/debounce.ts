// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
export const debounce = <T extends unknown[]>(
	  callback: (...args: T) => void,
	  delay: number,
	) => {
	  let timeoutTimer: ReturnType<typeof setTimeout>;
	 
	  return (...args: T) => {
	    clearTimeout(timeoutTimer);
	 
	    timeoutTimer = setTimeout(() => {
	      callback(...args);
	    }, delay);
	  };
	};