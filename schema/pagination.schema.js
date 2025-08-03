import * as y from "yup";

export const offsetPaginationSchema = y.object({
  page: y
    .number()
    .transform((val) => {
      if (typeof val === "string") {
        return parseInt(val);
      }
      return val;
    })
    .min(0),
  limit: y
    .number()
    .transform((val) => {
      if (typeof val === "string") {
        return parseInt(val);
      }
      return val;
    })
    .min(1),
});

export const cursorPaginationSchema = y.object({
  cursor: y.string().optional(),
  limit: y
    .number()
    .transform((val) => {
      if (typeof val === "string") {
        return parseInt(val);
      }
      return val;
    })
    .min(1),
});
