import VisionPage from "./VisionPage";

export default function SceneDescription(props) {
  return (
    <VisionPage
      {...props}
      mode="scene"
      title={props.t.sceneDescription}
      description={
        props.t.sceneDescriptionDescription
      }
    />
  );
}
