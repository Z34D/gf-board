import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import Slideshow from "./Slideshow";
import LocationSelectionView from "./LocationSelectionView";
import "./index.css";

function App() {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    // Location from URL path: /flieden → "flieden"
    const slug = window.location.pathname.slice(1).toLowerCase();
    if (slug) setLocation(slug);
  }, []);

  if (location) return <Slideshow location={location} />;
  return <LocationSelectionView />;
}

createRoot(document.getElementById("root")!).render(<App />);
