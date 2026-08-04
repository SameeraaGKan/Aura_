import z from "zod"

export const CreateOrderSchema = z.object({
    marketID:z.string(),
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.int(),
    qty: z.int()
})

type Orderbook = {[key: string]:{
    availableQty:number,
    orders:
    {userID: string,
     qty: number,
     filledQty:number,
     originalOrderID:string
    }[]
}}