import VisionPage from "./VisionPage";

export default function ReadText(props) {
  return (
    <VisionPage
      {...props}
      mode="text"
      title={props.t.readText}
      description={props.t.readTextDescription}
    />
  );
}
