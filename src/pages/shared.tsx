import { useRouter } from "next/router";
import { useEffect } from "react";

const SharedNotes = () => {
  const router = useRouter();

  useEffect(() => {
    void router.replace({ pathname: "/notes", query: { filter: "shared" } });
  }, [router]);

  return null;
};

export default SharedNotes;
