import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"EoTrainer — Mon entraînement",description:"Ma course, mes sorties, mon programme."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}
