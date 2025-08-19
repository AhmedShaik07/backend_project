import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User }  from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave : false })

        return {accessToken, refreshToken}
        
    } catch (error) {
        throw new ApiError(500, "Someting went wrong while generating tokens.!")
    }
}

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
    const {fullname, email, password, username} = req.body
   
    // step -2
    if(
        [username, fullname, email, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required.!")
    }

    //step -3
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
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
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar is required.!")
    }

    //step -6
    const user = await User.create({
        username: username.toLowerCase(),
        email,
        fullname,
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

const userLogin = asyncHandler( async (req,res) => {
    /* step by step approach
    // req body -> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookie
    */
   
    const {username, email, password} = req.body

    if(!username && !email){
        throw new ApiError(400, "username or email is required.!")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404,"User does not exist.!");        
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(404, "Incorrect Password.!")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "user logged in succesfully"
        )
    )
});

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out succesfully.!"))


})

const refreshAccessToken = asyncHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request.!");
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
         if(!user){
            throw new ApiError(401, "Invalid refresh token.!");
        }
    
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Refresh token is expired")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {
                    accessToken, refreshToken: newRefreshToken
                },
                "Access token refreshed"
    
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token")        
    }
    
})
export {
    registerUser,
    userLogin,
    logoutUser,
    refreshAccessToken
}