import express, { type Request, type Response, type NextFunction } from "express"
import cors from "cors"
import { middleware } from "./middleware"
import { prisma } from "db";
import { CreateOrderSchema, SplitSchema, MergeSchema, CancelOrderSchema, OnRampSchema, OffRampSchema, HttpError, type Orderbook } from "./types";
import {uuid} from "uuidv4"

const app = express()

app.use(express.json())

app.use(cors())

function handleError(e: unknown, res: Response) {
    if (e instanceof HttpError) {
        res.status(e.statusCode).json({
            message: e.message
        })
        return
    }
    console.error(e)
    res.status(500).json({
        message: "Something went wrong"
    })
}

app.post("/order", middleware, async (req: Request, res: Response) => {
    const {success, data } = CreateOrderSchema.safeParse(req.body)
    const userID:string = req.userId!

    if (!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    try {
        const originalOrderID = uuid()
        await prisma.$transaction(async tx =>{
            const response = await tx.$queryRaw<{yesOrderbook:string, noOrderbook:string, id:string, totalQty:number}[]>`SELECT * FROM "Market" WHERE id=${data.marketID} FOR UPDATE;`

            const userResponse = await tx.$queryRaw<{id:string, address:string, usdBalance:number, lockedBalance:number}[]>`SELECT * FROM "User" WHERE id=${userID} FOR UPDATE;`

            const user = userResponse[0]
            if(!user){
                throw new HttpError(404, "User not found")
            }
            const availableBalance = user.usdBalance - user.lockedBalance

            const market = response[0]
            if (!market){
                throw new HttpError(404, "Market not found")
            }

            const yesOrderbook: Orderbook = JSON.parse(market.yesOrderbook)
            const noOrderbook: Orderbook = JSON.parse(market.noOrderbook)

            if(data.side == "yes" && data.type == "buy"){
                const usd = data.qty * data.price
                if(availableBalance < usd){
                    throw new HttpError(403, "Sorry you don't have enough $ in your account")
                }
                let leftQty = data.qty

                const prices = Object.keys(yesOrderbook).sort((a:string, b:string)=> Number(a)-Number(b))

                for (const price of prices) {
                    if (leftQty <= 0) break
                    if (Number(price) > data.price) break
                    const {orders} = yesOrderbook[price]!

                    for (const order of orders) {
                        if (leftQty <= 0) break
                        if (order.userID === userID) continue
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty
                        const reverseOrder = order.reverseOrder
                        if(!reverseOrder){
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"Yes"
                                    }
                                },
                                data:{
                                    qty:{
                                        decrement: matchedQty
                                    }
                                },
                            })
                            await tx.user.update({
                                where:{
                                    id:order.userID
                                },
                                data:{
                                    usdBalance: {
                                        increment: Number(price) * matchedQty
                                    }
                                }
                            })
                        }else {
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"No"
                                    }
                                },
                                data:{
                                    qty:{
                                        increment: matchedQty
                                    }
                                },
                            })
                        }

                        await tx.position.update({
                            where:{
                                userID_marketID_type:{
                                userID,
                                marketID: data.marketID,
                                type:"Yes"
                                }
                            },
                            data:{
                                qty:{
                                    increment: matchedQty
                                }
                            },
                        })
                        await tx.user.update({
                            where:{
                                id:userID
                            },
                            data:{
                                usdBalance: {
                                    decrement: (100 - Number(price)) * matchedQty
                                }
                            }
                        })

                        leftQty -= matchedQty
                        order.filledQty += matchedQty
                        yesOrderbook[price]!.availableQty -= matchedQty
                    }
                }

                if(leftQty){
                    const oppositePrice = 100 - data.price
                    if(!noOrderbook[oppositePrice]){
                        noOrderbook[oppositePrice] ={availableQty:0, orders:[]}
                    }

                    noOrderbook[oppositePrice]!.availableQty += leftQty
                    noOrderbook[oppositePrice]!.orders.push({qty:leftQty, userID, filledQty: 0, originalOrderID, reverseOrder: false})

                    await tx.user.update({
                        where: { id: userID },
                        data: { lockedBalance: { increment: leftQty * data.price } }
                    })
                }
            }

            if(data.side == "no" && data.type == "buy"){
                const usd = data.qty * data.price
                if(availableBalance < usd){
                    throw new HttpError(403, "Sorry you don't have enough $ in your account")
                }
                let leftQty = data.qty

                const prices = Object.keys(noOrderbook).sort((a:string, b:string)=> Number(a)-Number(b))

                for (const price of prices) {
                    if (leftQty <= 0) break
                    if (Number(price) > data.price) break
                    const {orders} = noOrderbook[price]!

                    for (const order of orders) {
                        if (leftQty <= 0) break
                        if (order.userID === userID) continue
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty
                        const reverseOrder = order.reverseOrder
                        if(!reverseOrder){
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"No"
                                    }
                                },
                                data:{
                                    qty:{
                                        decrement: matchedQty
                                    }
                                },
                            })
                            await tx.user.update({
                                where:{
                                    id:order.userID
                                },
                                data:{
                                    usdBalance: {
                                        increment: Number(price) * matchedQty
                                    }
                                }
                            })
                        }else {
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"Yes"
                                    }
                                },
                                data:{
                                    qty:{
                                        increment: matchedQty
                                    }
                                },
                            })
                        }

                        await tx.position.update({
                            where:{
                                userID_marketID_type:{
                                userID,
                                marketID: data.marketID,
                                type:"No"
                                }
                            },
                            data:{
                                qty:{
                                    increment: matchedQty
                                }
                            },
                        })
                        await tx.user.update({
                            where:{
                                id:userID
                            },
                            data:{
                                usdBalance: {
                                    decrement: (100 - Number(price)) * matchedQty
                                }
                            }
                        })

                        leftQty -= matchedQty
                        order.filledQty += matchedQty
                        noOrderbook[price]!.availableQty -= matchedQty
                    }
                }

                if(leftQty){
                    const oppositePrice = 100 - data.price
                    if(!yesOrderbook[oppositePrice]){
                        yesOrderbook[oppositePrice] ={availableQty:0, orders:[]}
                    }

                    yesOrderbook[oppositePrice]!.availableQty += leftQty
                    yesOrderbook[oppositePrice]!.orders.push({qty:leftQty, userID, filledQty: 0, originalOrderID, reverseOrder: true})

                    await tx.user.update({
                        where: { id: userID },
                        data: { lockedBalance: { increment: leftQty * data.price } }
                    })
                }
            }

            if(data.side == "yes" && data.type == "sell"){
                const buyPrice = 100-data.price
                const userPosition = await tx.position.findFirst({
                    where:{
                        userID:userID,
                        marketID:data.marketID,
                        type: "Yes"
                    }
                })
                if (!userPosition){
                    throw new HttpError(403, "You don't have a position to sell")
                }
                if (userPosition.qty < data.qty){
                    throw new HttpError(403, "You don't have enough quantity to sell")
                }

                let leftQty = data.qty

                const prices = Object.keys(noOrderbook).sort((a:string, b:string)=> Number(a)-Number(b))

                for (const price of prices) {
                    if (leftQty <= 0) break
                    if (Number(price) > buyPrice) break
                    const {orders} = noOrderbook[price]!

                    for (const order of orders) {
                        if (leftQty <= 0) break
                        if (order.userID === userID) continue
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty
                        const reverseOrder = order.reverseOrder
                        if(!reverseOrder){
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"No"
                                    }
                                },
                                data:{
                                    qty:{
                                        decrement: matchedQty
                                    }
                                },
                            })
                            await tx.user.update({
                                where:{
                                    id:order.userID
                                },
                                data:{
                                    usdBalance: {
                                        increment: Number(price) * matchedQty
                                    }
                                }
                            })
                        }else {
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"Yes"
                                    }
                                },
                                data:{
                                    qty:{
                                        increment: matchedQty
                                    }
                                },
                            })
                        }

                        await tx.position.update({
                            where:{
                                userID_marketID_type:{
                                userID,
                                marketID: data.marketID,
                                type:"Yes"
                                }
                            },
                            data:{
                                qty:{
                                    decrement: matchedQty
                                }
                            },
                        })
                        await tx.user.update({
                            where:{
                                id:userID
                            },
                            data:{
                                usdBalance: {
                                    increment: (100 - Number(price)) * matchedQty
                                }
                            }
                        })

                        leftQty -= matchedQty
                        order.filledQty += matchedQty
                        noOrderbook[price]!.availableQty -= matchedQty
                    }
                }

                if(leftQty){
                    if(!yesOrderbook[data.price]){
                        yesOrderbook[data.price] ={availableQty:0, orders:[]}
                    }

                    yesOrderbook[data.price]!.availableQty += leftQty
                    yesOrderbook[data.price]!.orders.push({qty:leftQty, userID, filledQty: 0, originalOrderID, reverseOrder: true})
                }

            }

            if(data.side == "no" && data.type == "sell"){
                const buyPrice = 100-data.price
                const userPosition = await tx.position.findFirst({
                    where:{
                        userID:userID,
                        marketID:data.marketID,
                        type: "No"
                    }
                })
                if (!userPosition){
                    throw new HttpError(403, "You don't have a position to sell")
                }
                if (userPosition.qty < data.qty){
                    throw new HttpError(403, "You don't have enough quantity to sell")
                }

                let leftQty = data.qty

                const prices = Object.keys(yesOrderbook).sort((a:string, b:string)=> Number(a)-Number(b))

                for (const price of prices) {
                    if (leftQty <= 0) break
                    if (Number(price) > buyPrice) break
                    const {orders} = yesOrderbook[price]!

                    for (const order of orders) {
                        if (leftQty <= 0) break
                        if (order.userID === userID) continue
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty
                        const reverseOrder = order.reverseOrder
                        if(!reverseOrder){
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"Yes"
                                    }
                                },
                                data:{
                                    qty:{
                                        decrement: matchedQty
                                    }
                                },
                            })
                            await tx.user.update({
                                where:{
                                    id:order.userID
                                },
                                data:{
                                    usdBalance: {
                                        increment: Number(price) * matchedQty
                                    }
                                }
                            })
                        }else {
                            await tx.position.update({
                                where:{
                                    userID_marketID_type:{
                                        userID: order.userID,
                                    marketID: data.marketID,
                                    type:"No"
                                    }
                                },
                                data:{
                                    qty:{
                                        increment: matchedQty
                                    }
                                },
                            })
                        }

                        await tx.position.update({
                            where:{
                                userID_marketID_type:{
                                userID,
                                marketID: data.marketID,
                                type:"No"
                                }
                            },
                            data:{
                                qty:{
                                    decrement: matchedQty
                                }
                            },
                        })
                        await tx.user.update({
                            where:{
                                id:userID
                            },
                            data:{
                                usdBalance: {
                                    increment: (100 - Number(price)) * matchedQty
                                }
                            }
                        })

                        leftQty -= matchedQty
                        order.filledQty += matchedQty
                        yesOrderbook[price]!.availableQty -= matchedQty
                    }
                }

                if(leftQty){
                    if(!noOrderbook[data.price]){
                        noOrderbook[data.price] ={availableQty:0, orders:[]}
                    }

                    noOrderbook[data.price]!.availableQty += leftQty
                    noOrderbook[data.price]!.orders.push({qty:leftQty, userID, filledQty: 0, originalOrderID, reverseOrder: false})
                }

            }

            await tx.orderHistory.create({
                data:{
                    id:originalOrderID,
                    orderType:data.type === "buy"? "Buy" : "Sell",
                    userID,
                    price:data.price,
                    qty:data.qty,
                    marketID:data.marketID
                }
            })

            await tx.market.update({
                data: {
                    yesOrderbook: JSON.stringify(yesOrderbook),
                    noOrderbook: JSON.stringify(noOrderbook)
                },
                where: {
                    id: data.marketID
                }
            })
        })
        res.json({
            message: "Hi!"
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.post("/order/cancel", middleware, async (req: Request, res: Response) => {
    const {success, data} = CancelOrderSchema.safeParse(req.body)
    const userID: string = req.userId!

    if(!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    try {
        await prisma.$transaction(async tx => {
            const marketResponse = await tx.$queryRaw<{yesOrderbook:string, noOrderbook:string, id:string}[]>`SELECT * FROM "Market" WHERE id=${data.marketID} FOR UPDATE;`
            const market = marketResponse[0]
            if(!market){
                throw new HttpError(404, "Market not found")
            }

            const userResponse = await tx.$queryRaw<{id:string, usdBalance:number, lockedBalance:number}[]>`SELECT * FROM "User" WHERE id=${userID} FOR UPDATE;`
            const user = userResponse[0]
            if(!user){
                throw new HttpError(404, "User not found")
            }

            const order = await tx.orderHistory.findFirst({
                where: {
                    id: data.orderID,
                    userID,
                    marketID: data.marketID
                }
            })
            if(!order){
                throw new HttpError(404, "Order not found")
            }
            if(order.orderType !== "Buy" && order.orderType !== "Sell"){
                throw new HttpError(400, "This order cannot be cancelled")
            }

            const yesOrderbook: Orderbook = JSON.parse(market.yesOrderbook)
            const noOrderbook: Orderbook = JSON.parse(market.noOrderbook)

            let remainingQty: number | null = null

            for (const book of [yesOrderbook, noOrderbook]) {
                for (const price of Object.keys(book)) {
                    const level = book[price]!
                    const idx = level.orders.findIndex(o => o.originalOrderID === data.orderID)
                    if (idx !== -1) {
                        const restingOrder = level.orders[idx]!
                        remainingQty = restingOrder.qty - restingOrder.filledQty
                        level.orders.splice(idx, 1)
                        level.availableQty -= remainingQty
                        if (level.orders.length === 0) {
                            delete book[price]
                        }
                        break
                    }
                }
                if (remainingQty !== null) break
            }

            if (remainingQty === null){
                throw new HttpError(404, "Order is not resting in the book (already fully filled or cancelled)")
            }
            if (remainingQty <= 0){
                throw new HttpError(400, "Order already fully filled, nothing to cancel")
            }

            if (order.orderType === "Buy") {
                await tx.user.update({
                    where: { id: userID },
                    data: {
                        lockedBalance: {
                            decrement: remainingQty * order.price
                        }
                    }
                })
            }

            await tx.orderHistory.create({
                data: {
                    orderType: "Cancel",
                    userID,
                    price: order.price,
                    qty: remainingQty,
                    marketID: data.marketID
                }
            })

            await tx.market.update({
                where: { id: data.marketID },
                data: {
                    yesOrderbook: JSON.stringify(yesOrderbook),
                    noOrderbook: JSON.stringify(noOrderbook)
                }
            })
        })

        res.json({
            message: "Order cancelled"
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.get("/market", async (req: Request, res: Response) => {
    try {
        const marketID = req.query.marketID as string
        const market = await prisma.market.findFirst({
            where:{
                id: marketID
            }
        })

        if(!market){
            throw new HttpError(404, "Market not found")
        }

        res.json({
            market
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.post("/split", middleware, async (req: Request, res: Response) => {
    const {data, success} = SplitSchema.safeParse(req.body)
    const userID: string = req.userId!

    if(!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    const marketID = data.marketID

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{id:string, address:string, usdBalance:number, lockedBalance:number}[]>`SELECT * FROM "User" WHERE id=${userID} FOR UPDATE;`
            const user = userResponse[0]
            if(!user){
                throw new HttpError(404, "User not found")
            }

            const market = await tx.market.findFirst({
                where:{
                    id: marketID
                }
            })
            if(!market){
                throw new HttpError(404, "Market not found")
            }

            if(user.usdBalance - user.lockedBalance < data.amount){
                throw new HttpError(403, "Sorry you are not allowed to do this")
            }

            await tx.user.update({
                where:{
                    id:userID
                },
                data:{
                    usdBalance:{
                        decrement:data.amount
                    }
                }
            })

            await tx.position.upsert({
                where:{
                    userID_marketID_type:{
                        marketID,
                        userID,
                        type:"Yes"
                    }
                },
                create:{
                    marketID,
                    userID,
                    type:"Yes",
                    qty: data.amount
                },
                update:{
                    qty:{
                        increment:data.amount
                    }
                }
            })

            await tx.position.upsert({
                where:{
                    userID_marketID_type:{
                        marketID,
                        userID,
                        type:"No"
                    }
                },
                create:{
                    marketID,
                    userID,
                    type:"No",
                    qty: data.amount
                },
                update:{
                    qty:{
                        increment:data.amount
                    }
                }
            })

            await tx.orderHistory.create({
                data:{
                    orderType:"Split",
                    userID,
                    price:0,
                    qty:data.amount,
                    marketID:data.marketID
                }
            })
        })

        res.json({
            message: "Split successfully"
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.post("/merge", middleware, async (req: Request, res: Response) => {
    const {data, success} = MergeSchema.safeParse(req.body)
    const userID: string = req.userId!

    if(!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    const marketID = data.marketID

    try {
        await prisma.$transaction(async tx => {
            const market = await tx.market.findFirst({
                where:{
                    id: marketID
                }
            })
            if(!market){
                throw new HttpError(404, "Market not found")
            }

            const yesPositionResponse = await tx.$queryRaw<{id:string, qty:number}[]>`SELECT * FROM "Position" WHERE "userID"=${userID} AND "marketID"=${marketID} AND "type"='Yes' FOR UPDATE;`
            const noPositionResponse = await tx.$queryRaw<{id:string, qty:number}[]>`SELECT * FROM "Position" WHERE "userID"=${userID} AND "marketID"=${marketID} AND "type"='No' FOR UPDATE;`

            const yesPosition = yesPositionResponse[0]
            const noPosition = noPositionResponse[0]

            if(!yesPosition || yesPosition.qty < data.amount || !noPosition || noPosition.qty < data.amount){
                throw new HttpError(403, "Sorry you are not allowed to do this")
            }

            await tx.position.update({
                where:{
                    userID_marketID_type:{
                        marketID,
                        userID,
                        type:"Yes"
                    }
                },
                data:{
                    qty:{
                        decrement: data.amount
                    }
                }
            })

            await tx.position.update({
                where:{
                    userID_marketID_type:{
                        marketID,
                        userID,
                        type:"No"
                    }
                },
                data:{
                    qty:{
                        decrement: data.amount
                    }
                }
            })

            await tx.user.update({
                where:{
                    id:userID
                },
                data:{
                    usdBalance:{
                        increment: data.amount
                    }
                }
            })

            await tx.orderHistory.create({
                data:{
                    orderType:"Merge",
                    userID,
                    price:0,
                    qty:data.amount,
                    marketID:data.marketID
                }
            })
        })

        res.json({
            message: "Merged successfully"
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.get("/balance", middleware, async (req: Request, res: Response) => {
    try {
        const userID: string = req.userId!

        const user = await prisma.user.findUnique({
            where: {
                id: userID
            },
            select: {
                usdBalance: true,
                lockedBalance: true
            }
        })

        if (!user) {
            throw new HttpError(404, "User not found")
        }

        res.json({
            usdBalance: user.usdBalance,
            lockedBalance: user.lockedBalance,
            availableBalance: user.usdBalance - user.lockedBalance
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.post("/onramp", middleware, async (req: Request, res: Response) => {
    const {data, success} = OnRampSchema.safeParse(req.body)
    const userID: string = req.userId!

    if(!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    try {
        const user = await prisma.$transaction(async tx => {
            const updated = await tx.user.update({
                where: {
                    id: userID
                },
                data: {
                    usdBalance: {
                        increment: data.amount
                    }
                }
            })

            await tx.balanceTransaction.create({
                data: {
                    userID,
                    type: "Deposit",
                    amount: data.amount
                }
            })

            return updated
        })

        res.json({
            usdBalance: user.usdBalance,
            lockedBalance: user.lockedBalance,
            availableBalance: user.usdBalance - user.lockedBalance
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.post("/offramp", middleware, async (req: Request, res: Response) => {
    const {data, success} = OffRampSchema.safeParse(req.body)
    const userID: string = req.userId!

    if(!success){
        res.status(411).json({
            message:"Incorrect inputs"
        })
        return
    }

    try {
        const usdBalance = await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{id:string, usdBalance:number, lockedBalance:number}[]>`SELECT * FROM "User" WHERE id=${userID} FOR UPDATE;`
            const user = userResponse[0]
            if(!user){
                throw new HttpError(404, "User not found")
            }

            if(user.usdBalance - user.lockedBalance < data.amount){
                throw new HttpError(403, "Sorry you don't have enough $ in your account")
            }

            const updated = await tx.user.update({
                where: {
                    id: userID
                },
                data: {
                    usdBalance: {
                        decrement: data.amount
                    }
                }
            })

            await tx.balanceTransaction.create({
                data: {
                    userID,
                    type: "Withdrawal",
                    amount: data.amount
                }
            })

            return updated
        })

        res.json({
            usdBalance: usdBalance.usdBalance,
            lockedBalance: usdBalance.lockedBalance,
            availableBalance: usdBalance.usdBalance - usdBalance.lockedBalance
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.get("/positions", middleware, async (req: Request, res: Response) => {
    try {
        const userID: string = req.userId!
        const marketID = req.query.marketID as string | undefined

        const positions = await prisma.position.findMany({
            where: {
                userID,
                ...(marketID ? { marketID } : {})
            }
        })

        res.json({
            positions
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.get("/history", middleware, async (req: Request, res: Response) => {
    try {
        const userID: string = req.userId!
        const marketID = req.query.marketID as string | undefined

        const history = await prisma.orderHistory.findMany({
            where: {
                userID,
                ...(marketID ? { marketID } : {})
            }
        })

        res.json({
            history
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.get("/transactions", middleware, async (req: Request, res: Response) => {
    try {
        const userID: string = req.userId!

        const transactions = await prisma.balanceTransaction.findMany({
            where: {
                userID
            },
            orderBy: {
                createdAt: "desc"
            }
        })

        res.json({
            transactions
        })
    } catch (e) {
        handleError(e, res)
    }
})

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    handleError(err, res)
})

app.listen(3000)
