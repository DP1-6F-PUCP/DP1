import React, { createContext, useContext, useState, useCallback } from 'react';

interface LiveAnnouncerContextType {
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
}

const LiveAnnouncerContext = createContext<LiveAnnouncerContextType>({
  announcePolite: () => {},
  announceAssertive: () => {},
});

export const useLiveAnnouncer = () => useContext(LiveAnnouncerContext);

export const LiveAnnouncer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [politeMessage, setPoliteMessage] = useState<string>('');
  const [assertiveMessage, setAssertiveMessage] = useState<string>('');

  const announcePolite = useCallback((message: string) => {
    setPoliteMessage(message);
    setTimeout(() => setPoliteMessage(''), 5000);
  }, []);

  const announceAssertive = useCallback((message: string) => {
    setAssertiveMessage(message);
    setTimeout(() => setAssertiveMessage(''), 5000);
  }, []);

  return (
    <LiveAnnouncerContext.Provider value={{ announcePolite, announceAssertive }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </LiveAnnouncerContext.Provider>
  );
};
