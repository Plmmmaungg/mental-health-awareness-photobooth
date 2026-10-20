import React, { useState } from "react";

import BoothPage from "./components/BoothPage";
import LandingPage from "./components/LandingPage";
import LiveScreen from "./components/LiveScreen";
import { openLiveScreen } from "./lib/liveChannel";

/*
 * App shell:
 *
 *   ?screen=live  → second-display view (opened from the booth)
 *   home          → hero / landing screen
 *   booth         → main photobooth
 */
const isLiveScreen =
  new URLSearchParams(window.location.search).get("screen") === "live";

export default function App() {
  const [view, setView] = useState("home");
  const [openGalleryOnBooth, setOpenGalleryOnBooth] = useState(false);

  if (isLiveScreen) {
    return <LiveScreen />;
  }

  if (view === "home") {
    return (
      <LandingPage
        onStart={() => {
          setOpenGalleryOnBooth(false);
          setView("booth");
        }}
        onOpenGallery={() => {
          setOpenGalleryOnBooth(true);
          setView("booth");
        }}
        onOpenLiveScreen={openLiveScreen}
      />
    );
  }

  return (
    <BoothPage
      onHome={() => setView("home")}
      openGalleryInitially={openGalleryOnBooth}
    />
  );
}
