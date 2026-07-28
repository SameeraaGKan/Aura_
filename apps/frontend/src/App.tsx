import { useUser } from "./hooks/useUser";
import {useState } from "react";
import axios from "axios";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function App() {
  // const supabase = useSupabase()
  const [supabase, _setSupabase] = useState(createClient("https://gopyqzmtpsribodyqkzg.supabase.co", "sb_publishable_VVA_erSt7IFycVEIoaREPg_rcZXzSJL"));
  return <AppWrapper supabase={supabase} />
}

function AppWrapper({supabase}:{supabase:SupabaseClient}){
  const {claims} = useUser(supabase);

  return <div>
    {!claims && <button onClick={async () => {
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain: 'solana',
        statement: 'I confirm I want to sign into the Prediction Market',
      })

      if (error) console.error('signInWithWeb3 error:', error)
      console.log('signInWithWeb3 data:', data)
 
    }}>Sign in w Solana</button>}

    {claims && <button onClick={async () => {
      await supabase.auth.signOut()
    }}>Logout</button>}

    {JSON.stringify(claims)}

    <button onClick={async() => {
      await supabase.auth.getSession().then( r=> {
        console.log(r.data.session?.access_token)
        axios.post("http://localhost:3000/buy", {
        
        }, {
          headers: {
            Authorization: r.data.session?.access_token
          }
        })
      })
    }}>
      Click here to buy
    </button>

  </div>
}

export default App
