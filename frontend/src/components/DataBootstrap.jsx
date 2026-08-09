import { useEffect } from 'react';
import { useData } from '../context/DataContext';
import LoadingScreen from './LoadingScreen';

export default function DataBootstrap({ children }) {
  const { loaded, reloadAll } = useData();

  useEffect(() => {
    if (!loaded) reloadAll();
  }, [loaded, reloadAll]);

  if (!loaded) {
    return <LoadingScreen />;
  }
  return children;
}
