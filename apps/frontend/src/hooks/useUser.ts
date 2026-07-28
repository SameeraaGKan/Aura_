import { createClient, type JwtPayload } from "@supabase/supabase-js"
import { useEffect, useState } from "react";

export function useUser(){
  const [claims, setClaims] = useState<JwtPayload | null>(null);
  const supabase = createClient("https://gopyqzmtpsribodyqkzg.supabase.co", "sb_publishable_VVA_erSt7IFycVEIoaREPg_rcZXzSJL");

  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      setClaims(data?.claims ?? null)
    })

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getClaims().then(({ data }) => {
        setClaims(data?.claims ?? null)
      })
    })

    return () => subscription.unsubscribe()
    
  }, [])

  return{
    claims
  }
}