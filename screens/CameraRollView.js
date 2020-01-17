import React, { Component, PropTypes } from 'react'
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableHighlight,
  View,
  Text,
  FlatList,
  Dimensions
} from 'react-native';

import CameraRoll from "@react-native-community/cameraroll"
import { TouchableNativeFeedback, TouchableOpacity } from 'react-native-gesture-handler';
import ImagePicker from 'react-native-image-crop-picker';
import RNFS from 'react-native-fs'
import Realm from 'realm'
import Geolocation from '@react-native-community/geolocation';
import cropSchema from './../storage/realm/cropSchema'
import Icon from 'react-native-vector-icons/Entypo';


class CameraRollView extends Component {

  constructor(props) {
    super(props)
    this.state = {
      images: [],
      selected: false,
      selectedOption: "",
      fetchParams: { first: 25 },
      prediction:null,
      location:null,

    }

  }


  componentDidMount = async () => {
    let camerarollImageArray = await CameraRoll.getPhotos({ first: 25, assetType: "Photos" });
    let imageNodes = camerarollImageArray.edges
    let images = imageNodes.map(imageNode => imageNode.node.image)
    console.log(images.length)

    this.setState({
      images: images,
    })


  }

  selectPhoto() {
    if (this.state.selectedOption === 'camera') {
      ImagePicker.openCamera({
        cropping: true,
        width: 500,
        height: 500,
        //cropperCircleOverlay: true,
        compressImageMaxWidth: 640,
        compressImageMaxHeight: 480,
        freeStyleCropEnabled: true,
        includeBase64: true
      }).then(image => {
        console.log("imagetype, path = " + image.mime + "  " + image.path)

        this.setState({
          photo: image,
          selected: true,
        });
      })
        .catch(e => {
          console.log(e), this.setState({ imageModalVisible: false })
        });

      console.log('camera')
    } else if (this.state.selectedOption==='gallery'){
      ImagePicker.openPicker({
        cropping: true,
        width: 300,
        height: 400,
        //cropperCircleOverlay: true,
        freeStyleCropEnabled: true,
        avoidEmptySpaceAroundImage: true,
        includeBase64: true,
        compressImageMaxWidth: 640,
        compressImageMaxHeight: 480,
        avoidEmptySpaceAroundImage: false,
      }).then(image => {

        this.setState({
          photo: image,
          selected: true,
        });
      })
        .catch(e => console.log(e));

    }
  }

  viewAllPhotos = () => {
    this.setState(prevState => ({
      selectedOption: "gallery"
    }))
    this.selectPhoto()
  }

  viewCamera = () => {
    this.setState(prevState => ({
      selectedOption: "camera"
    }))
    this.selectPhoto()
  }

  galleryImageSelect = (item) => {

    try{
      ImagePicker.openCropper({
        path:item.uri,
        width: 500,
        height: 500,
        freeStyleCropEnabled: true,
        avoidEmptySpaceAroundImage: false,
  
      }).then( image => {
        this.setState({
          photo: image,
          selected: true,
        });
      })

    } catch (e) {
      console.log('Error/ User cancelled galleryImageSelecy')
    }
    
  }


  handleUploadPhoto = async () => {

    try {
      var photo = {
        type: this.state.photo.mime,
        uri: this.state.photo.path,
        name: 'uploadImage.png',
      };

      var formData = new FormData();

      formData.append('submit', 'ok');
      formData.append('file', photo);

      let response = await fetch("https://blitz-crop-app.appspot.com/analyze", {
        method: "POST",
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      })



      let responseJSON = await response.json()

      this.setState({
        prediction: responseJSON.result,
      });

      console.log('response = ' + response.result)
      console.log('Prediction- ' + this.state.prediction)
      await this.addImgToDB()
    } catch (e) {
      console.log("Error in handleUploadPhoto");
      console.log(e)
    }

  }

  findCoordinates = async () => {
    try {
      if (Platform.OS == "android") {
        await requestLocationPermission();
      }

      const config = {
        authorizationLevel: "whenInUse",
      }

      await Geolocation.setRNConfiguration(config);
      Geolocation.getCurrentPosition(
        (position) => {
          console.log("find cords" + position);
          this.setState({ location: position });
        },
        error => Alert.alert(error.message),

      );

      console.log("location = " + this.state.location)
      return true
    } catch (e) {
      console.log("Error in findCordinates in ImageSelect.")
      return false
    }

  }

  timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  addImgToDB = async () => {
    try {
      await this.findCoordinates()

      await this.timeout(1000)



      let datauri = (this.state.photo.path).split('/');
      const imageinfo = datauri[datauri.length - 1];

      try {
        await RNFS.mkdir(RNFS.DocumentDirectoryPath + '/Realm_db/Images/');
        await RNFS.mkdir(RNFS.DocumentDirectoryPath + '/Realm_db/Database/');
        await RNFS.copyFile(this.state.photo.path, RNFS.DocumentDirectoryPath + '/Realm_db/Images/' + imageinfo);


        console.log(this.state.photo.path);
      } catch (e) {
        console.log(e);
        console.log('Error in addImgToDB');
      }

      console.log("waiting")

      console.log("loc " + this.state.location)

      let realm = await Realm.open({
        path: RNFS.DocumentDirectoryPath + '/Realm_db/Database/Crops.realm',
        schema: [cropSchema]
      })



      realm.write(async () => {


        let x = this.state.location.coords.latitude
        x = x.toString()
        let y = this.state.location.coords.longitude
        y = y.toString()

        console.log("x " + x + " y " + y);
        let prediction = (this.state.prediction != null) ? this.state.prediction : "Not classified"
        realm.create('Crop', {

          image_uri: 'file://' + RNFS.DocumentDirectoryPath + '/Realm_db/Images/' + imageinfo,
          image_type: this.state.photo.mime,
          data_added: new Date(),
          classify: prediction,
          lat: x,
          lon: y,
        })
      })

      if (this.state.prediction != null) {
        alert("Image Classified and saved to Database successfully");
      }
      else {
        alert("Image saved successfully to database");
      }

      this.setState(prevstate => ({
        photo: '',
        prediction: null,
        selected:false,
      }))


    } catch (e) {
      console.log(e);
      console.log("Error in addToDB in ImageSelect");
    }

  }


  render() {


    if (!this.state.selected) {

      /* First Screen before image selection */

      return (
        <View style={{ flex: 1, backgroundColor: 'white' }}>
          <View style={{ height: Dimensions.get('window').width / 9 }}>
            <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignContent: "center" }}>

              <Text style={styles.heading}>
                Photos
              </Text>

              <TouchableOpacity onPress={this.viewAllPhotos}>
                <Text style={styles.allPhotos}>
                  All Photos
              </Text>
              </TouchableOpacity>

            </View>

          </View>
          <View style={{ flex: 1, backgroundColor: 'white', height: Dimensions.get('window').width / 2.5 + Dimensions.get('window').width / 40}}>
            <FlatList style={styles.container}
              data={this.state.images}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => this.galleryImageSelect(item)}>
                  <Image source={{ uri: item.uri }} style={styles.image} />
                </TouchableOpacity>
              )}

              keyExtractor={item => item.uri}
              horizontal={true}
            />
          </View>
          <View style={{ flex: 3 }}>
            <View style={[styles.centeredItem, { flexDirection: 'row' }]}>
              <TouchableOpacity onPress={this.viewCamera}>
                <Icon name="camera" size={Dimensions.get('window').width / 4} />
                <Text style={{ margin: 10, fontSize: Dimensions.get('window').width / 20 }}>
                  Select image from camera
                  </Text>

              </TouchableOpacity>


            </View>
            <View style={[styles.centeredItem, { flexDirection: 'row' }]}>
              <TouchableOpacity onPress={this.viewAllPhotos}>
                <Icon name="images" size={Dimensions.get('window').width / 4} />
                <Text style={{ margin: 10, fontSize: Dimensions.get('window').width / 20 }}>
                  Select Image from Gallery
                  </Text>

              </TouchableOpacity>


            </View>

          </View>
          
        </View>
      )
    } else {


      /* Second Screen after image selection */

      return (

        <View style={{ height: Dimensions.get('window').height, width: Dimensions.get('window').width }}>
          <View>
            <Image
              source={{ uri: this.state.photo.path }}
              style={{ height: Dimensions.get('window').width, width: Dimensions.get('window').width }}
              resizeMode="contain"
            />
            <Text style={{ textAlign: 'center' }}>Preview</Text>
          </View>

          <TouchableOpacity onPress={this.handleUploadPhoto} style={styles.btnSection}  >
            <Text style={styles.btnText}>Classify Now</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={this.addImgToDB} style={styles.btnSection}  >
            <Text style={styles.btnText}>Save to DATABASE</Text>
          </TouchableOpacity>


        </View>
      )

    }


  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    height: Dimensions.get('window').width / 2.5 + Dimensions.get('window').width / 40,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  image: {
    width: Dimensions.get('window').width / 2.5,
    height: Dimensions.get('window').width / 2.5,
    marginVertical: Dimensions.get('window').width / 40,
    marginLeft: Dimensions.get('window').width / 40,
    borderRadius: Dimensions.get('window').width / 30,
  },
  heading: {
    fontSize: Dimensions.get('window').width / 20,
    margin: Dimensions.get('window').width / 40,
  },

  allPhotos: {
    fontSize: Dimensions.get('window').width / 25,
    marginBottom: Dimensions.get('window').width / 40,
    marginTop: Dimensions.get('window').width / 10 - (Dimensions.get('window').width / 40 + Dimensions.get('window').width / 25),
    marginRight: Dimensions.get('window').width / 40,
    color: "#23a0e8"
  },
  centeredItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topItem: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },

    bottomItem: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },

});

export default CameraRollView
