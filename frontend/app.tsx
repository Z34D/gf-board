import { createRoot } from "react-dom/client";
import Slideshow from "./Slideshow";
import LocationSelectionView from "./LocationSelectionView";
import "./index.css";

function App() {
  // Location from URL path: /flieden → "flieden". Resolved synchronously on
  // first render so we never flash the selection view before the slideshow.
  const slug = window.location.pathname.slice(1).toLowerCase();
  if (slug) return <Slideshow location={slug} />;
  return <LocationSelectionView />;
}

createRoot(document.getElementById("root")!).render(<App />);
