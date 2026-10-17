import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:"Stride — Votre prochaine ligne de départ",description:"Un plan de course qui suit votre rythme."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}
