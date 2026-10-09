import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { AppData } from '../storage/schema';
import { loadAppData, saveAppData } from '../storage/storage';
import type { Action } from './actions';
import { appReducer } from './reducer';

interface AppContextValue {
  state: AppData;
  dispatch: Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  initialData?: AppData;
}

/**
 * Global application provider (D3, D4, D5).
 * - Loads state from localStorage on initial mount (RF-40).
 * - Delegates state changes to pure domain reducer (D4).
 * - Automatically persists state to localStorage on every change (RF-39, D5).
 */
export function AppProvider({ children, initialData }: AppProviderProps) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    () => initialData ?? loadAppData()
  );

  useEffect(() => {
    saveAppData(state);
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to access current application state.
 */
export function useAppState(): AppData {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState debe usarse dentro de un AppProvider.');
  }
  return context.state;
}

/**
 * Hook to access application dispatcher.
 */
export function useAppDispatch(): Dispatch<Action> {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppDispatch debe usarse dentro de un AppProvider.');
  }
  return context.dispatch;
}
