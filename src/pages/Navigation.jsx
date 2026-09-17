import VisionPage from "./VisionPage";

export default function Navigation(props) {
  return (
    <VisionPage
      {...props}
      mode="navigation"
      title={props.t.navigation}
      description={
        props.t.navigationDescription
      }
    />
  );
}
