import { Router, type IRouter } from "express";
import healthRouter from "./health";
import queueRouter from "./queue";

const router: IRouter = Router();

router.use(healthRouter);
router.use(queueRouter);

export default router;
