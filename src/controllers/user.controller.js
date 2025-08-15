import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User }  from "../models/user.model.js";
import { uploadOnCluodinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async (req, res) => {
    /*steps to do to register a new user in db
    // collect details from user
    // validate the details
    // check if user exists already using username and email
    // check for images and avatar
    // upload those media files to cloudinary
    // create user - create entry in db
    // remove password and refresh token in response 
    // return response to frontend (either created or not)
    */     

    // step -1
    const {fullName, email, password, userName} = req.body
    console.log("email: ", email);

    // step -2
    if(
        [userName, fullName, email, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required.!")
    }

    //step -3
    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    });

    if(existedUser){
        throw new ApiError(409, "User with given name or email already exists.!")
    }

    //step -4(checking for avatar)
    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required.!")
    }

    //step -5
    const avatar = await uploadOnCluodinary(avatarLocalPath);
    const coverImage = await uploadOnCluodinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar is required.!")
    }

    //step -6
    const user = await User.create({
        userName: userName.toLowerCase(),
        email,
        fullName,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    });

    //checking if user is created or not in db and select() method returns the response 
    // and -symbol represnts not to include those parameters in the repsonse
    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    //step -7 & step -8
    if(!createdUser){
        throw new ApiError(500, "something went wrong while registering");
    }
    
    //step -9
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered succesfully.!")
    )
    
  
});

export {registerUser}