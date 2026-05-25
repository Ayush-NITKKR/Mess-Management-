const cloudinary = require("cloudinary").v2;

//Upload the image in cloduinary

exports.uploadImageToCloudinary = async (file , folder , quality) => {
    const options = {folder};

    if(quality){
        options.quality=quality;
    }
    options.resource_type = "auto";

    return await cloudinary.uploader.upload(file.tempFilePath , options);
}