import type { NextFunction, Response, Request } from "express";
import {prisma} from "db" 

import { createClient } from "@supabase/supabase-js"

const supabase = createClient("https://gopyqzmtpsribodyqkzg.supabase.co", process.env.SUPABASE_SECRET_KEY!)

// const supabase = useSupabase()

export async function middleware(req: Request, res:Response, next: NextFunction){
    const token= req.headers.authorization;

    try {
        const {data: {user}, error} = await supabase.auth.getUser(token)
        const address:string = user?.user_metadata.custom_claims.address

        if(error || !address){
            res.status(403).json({
                message: "Incorrect credentials"
            })
            return
        }

        const userDB = await prisma.user.upsert({
            where: {
                address,
            },
            update:{
                address,
            },
            create:{
                address,
                usdBalance:0
            }
        })
        if (address){
            req.userId = userDB.id
            next()  
        } else {
            res.status(403).json({
                message:"Incorrect credentials"
            })
        }
        
    }
    catch(e) {
        res.status(403).json({
            message: "Incorrect credentials"
        })
    }

}