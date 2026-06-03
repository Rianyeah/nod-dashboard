import { createContext, useContext } from 'react';

export const DashboardSidebarContext = createContext({
  setLastUpdates: () => {},
});

export function useDashboardSidebar() {
  return useContext(DashboardSidebarContext);
}
