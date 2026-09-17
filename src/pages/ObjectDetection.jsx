import VisionPage from "./VisionPage";

export default function ObjectDetection(props) {
  return (
    <VisionPage
      {...props}
      mode="general"
      title={props.t.objectDetection}
      description={
        props.t.objectDetectionDescription
      }
    />
  );
}
