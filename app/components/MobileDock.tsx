"use client";

import { useEffect, useState } from "react";

const patientRoutes=["/","/providers","/appointments","/wallet","/family","/payments","/support","/notifications"];

export default function MobileDock(){
  const [path,setPath]=useState("");
  useEffect(()=>setPath(window.location.pathname),[]);
  if(!patientRoutes.includes(path))return null;
  const items=[{href:"/",icon:"⌂",label:"Home"},{href:"/providers",icon:"⌕",label:"Find care"},{href:"/appointments",icon:"◎",label:"Visits"},{href:"/wallet",icon:"▤",label:"Wallet"},{href:"/journeys",icon:"◇",label:"More"}];
  return <nav className="mobile-dock" aria-label="Mobile navigation">{items.map(item=><a className={path===item.href?"active":""} href={item.href} key={item.href} aria-current={path===item.href?"page":undefined}><span aria-hidden="true">{item.icon}</span><b>{item.label}</b></a>)}</nav>;
}
