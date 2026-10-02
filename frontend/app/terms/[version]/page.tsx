import {notFound}from'next/navigation';
import PublicInformation from '@/components/entry/PublicInformation';
import document from '@/lib/termsDocument.json';
import '../../marketing.css';
export function generateStaticParams(){return[{version:document.version}];}
export default async function Page({params}:{params:Promise<{version:string}>}){const{version}=await params;if(version!==document.version)notFound();return <PublicInformation page="terms"/>;}
