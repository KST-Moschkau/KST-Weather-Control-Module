# KST-Weather-Control-Module
KST Weather Control Module for ZD RealityHUB



HOWTO:

Paste the source files somewhere on your HUB server and enter your Servers IP, Port and the desired Backend Port in the ini files found under src/server. You can start the module with npm start in console. There is a start script as batchfile which you could place on your desktop or whereever to also start the process. All you have to do is to adjust the path in the batchfile to match your file location.

The files in Assets should go into your Unreal Engine project. 
This module utilizes the awesome Ultra Dynamic Sky Blueprint which can be bought here: https://www.unrealengine.com/marketplace/en-US/product/ultra-dynamic-sky
There should be an instance of Ultra Dynamic Sky, Ultra Dynamic Weather and KST Weather Control in the scene before hitting play.

This module is based on the open weather map api: https://openweathermap.org/
To use it you have to create an account and get your api token as described here: https://openweathermap.org/appid
You should also search for the desired location you want to get weather data from and extract the cityID from the link like here: https://openweathermap.org/city/2884245

Paste both into the Weather Control page and hit find city. If successful it will will the page with live data from that location.
You can either manually or automatically update the data with the update buttons.
If "Link to Sky" is enabled the module will try to write the data into the Weather Control node in the nodegraph on all online engines with every update.

The KST Weather Control blueprint is adjusted to simulate as many of the possible owmAPI weather conditions as good as possible. It can be freely adjusted in the OnChangedWeatherID function. I would advise to enable auto-exposure so your scene wont get to dark in cloudy or night situations. The KST WC node has a cloud density multiplier to soften the density a little bit.

Have fun!
