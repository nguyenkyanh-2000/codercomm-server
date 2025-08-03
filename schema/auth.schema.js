import * as y from "yup";

export const loginSchema = y.object().shape({
  email: y.string().email().required(),
  password: y.string().required(),
});

export const registerSchema = y.object().shape({
  email: y.string().email().required(),
  password: y.string().required(),
  name: y.string().required(),
});
