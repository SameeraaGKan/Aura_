import express from "express"
import cors from "cors"
import { middleware } from "./middleware"
import { prisma } from "db";
import { CreateOrderSchema } from "./types";

const app = express()

app.use(express.json())

app.use(cors())

app.post("/buy", middleware, async (req, res) => {
    const {success, data } = CreateOrderSchema.safeParse(req.body)
    const userID:string = req.userID

    if (!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    await prisma.$transaction(async tx =>{
        const response = await tx.$queryRaw<{yesOrderbook:string, noOrderbook:string, id:string, totalQty:number}[]>`SELECT * FROM "Market" WHERE id=${data.marketID} FOR UPDATE;`

        const userResponse = await tx.$queryRaw<{id:string, address:string, usdBalance:number}[]>`SELECT * FROM "User" WHERE id=${userID} FOR UPDATE;`

        // console.log(response)
        const user = userResponse[0]
        if(!user){
            return
        }

        const market = response[0]
        if (!market){
            return;
        }

        const yesOrderbook = JSON.parse(market.yesOrderbook)
        const noOrderbook = JSON.parse(market.noOrderbook)

        if(data.side == "yes"){
            const usd = data.qty * data.price
            if(user.usdBalance < usd){
                res.status(403).json({
                    message: "Sorry you don't have enough $ in your account"
                })
                return
            } else {
                 
            }
        }
        // const orderbook
        // tx.market.update({
        //     data: {
        //         title: "new title"
        //     },
        //     where: {
        //         id: marketID
        //     }
        // })
    })
    res.json({
        message: "Hi!"
    })
})

app.post("/sell", middleware, (req, res) => {
    
})

app.post("/split", middleware, (req, res) => {

})

app.post("/merge", middleware, (req, res) => {
    
})

app.get("/balance", middleware, (req, res) => {

})

app.get("/positions", middleware, (req, res) => {
    
})

app.post("/history", middleware, (req, res) => {
    
})

app.listen(3000)

