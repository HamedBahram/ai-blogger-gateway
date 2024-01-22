import { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { openai } from "./openai";
import { supabase } from "./supabase";
import { decode } from './decode'
import { environment } from "@zuplo/runtime";


export default async function (request: ZuploRequest, context: ZuploContext) {
  const { prompt, userId } = await request.json();

  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: `Write a blog post around 200 words about the following topic: "${prompt}" in markdown format.`,
      },
    ],
  });

  const content = chatCompletion?.choices?.[0]?.message?.content
  if (!content) {
    return new Response(JSON.stringify({error: 'Unable to generate the blog post.'}), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }); 
  }

  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt: `Generate an image for a blog post about "${prompt}"`,
    n: 1,
    size: '1792x1024',
    response_format: 'b64_json'
  })

  const imageName = `blog-${Date.now()}`
  const imageData = image?.data?.[0]?.b64_json as string
  if (!imageData) {
    return new Response(JSON.stringify({error: 'Undable to generate the blog image.'}), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    })
  }

  const { data, error } = await supabase.storage
    .from('blogs')
    .upload(imageName, decode(imageData), {
      contentType: 'image/png'
    })

  if (error) {
    return new Response(JSON.stringify({error: 'Unable to upload the blog image to Storage.'}), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      }
    })
  }

  const path = data?.path
  const imageUrl = `${environment.SUPABASE_URL}/storage/v1/object/public/blogs/${path}`

  const { data: blog, error: blogError } = await supabase
    .from('blogs')
    .insert([{ title: prompt, content, imageUrl, userId }])
    .select()

  if (blogError) {
    return new Response(JSON.stringify({error: 'Undable to save the blog post to DB'}), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      }
    })
  }

  const savedBlog = blog?.[0]
  return new Response(JSON.stringify(savedBlog), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    }
  })
}
