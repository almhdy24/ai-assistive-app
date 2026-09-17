import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Home from "../pages/Home";
import ObjectDetection from "../pages/ObjectDetection";
import ReadText from "../pages/ReadText";
import SceneDescription from "../pages/SceneDescription";
import Navigation from "../pages/Navigation";

export default function AppRoutes(props) {
  return (
    <Routes>
      <Route
        path="/"
        element={<Home {...props} />}
      />

      <Route
        path="/object-detection"
        element={
          <ObjectDetection {...props} />
        }
      />

      <Route
        path="/read-text"
        element={<ReadText {...props} />}
      />

      <Route
        path="/scene-description"
        element={
          <SceneDescription {...props} />
        }
      />

      <Route
        path="/navigation"
        element={<Navigation {...props} />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}
