import * as yup from "yup";

export const updateUserSchema = yup.object({
  name: yup.string(),
  avatarUrl: yup.string().url(),
  coverUrl: yup.string().url(),
  aboutMe: yup.string(),
  city: yup.string(),
  country: yup.string(),
  company: yup.string(),
  jobTitle: yup.string(),
  facebookLink: yup.string().url(),
  instagramLink: yup.string().url(),
  linkedinLink: yup.string().url(),
  twitterLink: yup.string().url(),
});
